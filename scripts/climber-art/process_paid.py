#!/usr/bin/env python3
"""Validate and compile generated paid character sheets; never modify masters."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
import tempfile

import numpy as np
import itertools

from PIL import Image, ImageFilter, ImageOps

IDS = ('kestrel', 'lynx', 'raven', 'panther', 'wolf', 'otter', 'heron', 'yak',
       'mantis', 'cobra', 'badger', 'falcon', 'marmot', 'bison', 'ibex', 'sentinel', 'viking', 'gecko')
GREEN_KEY_IDS = {'lynx', 'panther', 'wolf', 'badger'}
KEYS = {'magenta': (255, 0, 255), 'green': (0, 255, 0)}
CELL = 192
SOLE = 172
VISIBLE_ALPHA = 40
MAX_SHIFT = 24
MIN_FRAME_DIFF = 1000
TARGET_GUTTER = 11
MIN_SHARED_SCALE = 0.65
# Per-frame cycle stabilisation (see stabilise_climb / stabilise_run): how far a
# frame's body may be scaled to match its cycle's reference mass, and how far it
# may be translated onto the reference body.
RUN_SCALE_RANGE = (0.9, 1.2)
CLIMB_SCALE_RANGE = (0.9, 1.1)
STABILISE_SHIFT = 24
BODY_BLUR = 3
HEAD_FRACTION = 0.35
ROOT = (96, 172.5)
GROUNDED_POSES = frozenset((0, 1, 2, 3, 4, 6, 7))
REPO = Path(__file__).resolve().parents[2]


class InvalidArt(ValueError):
    """The source cannot safely be published without artistic correction."""


def key_alpha(source: Image.Image, key: str) -> Image.Image:
    """Remove only colors near the chosen key, unmixing partial-alpha edges.

    Far colors remain bit-identical. Already transparent input is preserved;
    opaque input must actually show the selected key around its outer border.
    """
    data = np.asarray(source.convert('RGBA')).copy()
    border = np.concatenate((data[0], data[-1], data[:, 0], data[:, -1]))
    if np.mean(border[:, 3] <= VISIBLE_ALPHA) > 0.9:
        return Image.fromarray(data)
    color = np.asarray(KEYS[key], dtype=np.float32)
    distance = np.max(np.abs(data[:, :, :3].astype(np.float32) - color), axis=2)
    border_distance = np.max(np.abs(border[:, :3].astype(np.float32) - color), axis=1)
    if np.mean(border_distance <= 25) < 0.9:
        raise InvalidArt(f'{key} key absent from >10% of border; check key choice, crop or background')
    opacity = np.clip((distance - 25) / 95, 0, 1)
    partial = (opacity > 0) & (opacity < 1)
    rgb = data[:, :, :3].astype(np.float32)
    rgb[partial] = (rgb[partial] - (1 - opacity[partial, None]) * color) / opacity[partial, None]
    data[:, :, :3] = np.clip(np.rint(rgb), 0, 255).astype(np.uint8)
    data[:, :, 3] = np.rint(data[:, :, 3] * opacity).astype(np.uint8)
    data[data[:, :, 3] == 0] = 0
    return Image.fromarray(data)


def visible_bounds(cell: Image.Image) -> tuple[int, int, int, int]:
    y, x = np.where(np.asarray(cell)[:, :, 3] > VISIBLE_ALPHA)
    if len(x) < 100:
        raise InvalidArt('empty or nearly empty frame')
    return int(x.min()), int(y.min()), int(x.max()), int(y.max())


def grounded(cell: Image.Image, max_shift: int) -> tuple[Image.Image, int]:
    left, top, right, bottom = visible_bounds(cell)
    shift = SOLE - bottom
    if abs(shift) > max_shift:
        raise InvalidArt(f'grounding requires {shift}px shift (limit {max_shift}); regenerate framing')
    if top + shift < 1 or bottom + shift >= CELL - 1:
        raise InvalidArt('grounding would clip the character')
    result = Image.new('RGBA', cell.size)
    result.alpha_composite(cell, (0, shift))
    return result, shift


def frame_diff(first: Image.Image, second: Image.Image) -> int:
    a = np.asarray(first).astype(np.int16)
    b = np.asarray(second).astype(np.int16)
    visible = (a[:, :, 3] > VISIBLE_ALPHA) | (b[:, :, 3] > VISIBLE_ALPHA)
    return int(np.sum(np.any(np.abs(a - b) > 48, axis=2) & visible))


def frame_summary(cell: Image.Image, index: int, allow_tight: bool = False) -> dict:
    left, top, right, bottom = visible_bounds(cell)
    gutter = min(left, top, CELL - 1 - right, CELL - 1 - bottom)
    if gutter < (1 if allow_tight else 2):
        raise InvalidArt(f'frame {index + 1} touches cell edge ({gutter}px gutter)')
    return {'frame': index + 1, 'bounds': [left, top, right, bottom],
            'minGutter': gutter, 'gutterWarning': gutter < 10}


def compile_sheet(path: Path, kind: str, key: str, max_shift: int = MAX_SHIFT,
                  allow_tight: bool = False, defer_grounding: bool = False) -> tuple[Image.Image, dict]:
    cols, rows = (4, 2) if kind == 'poses' else ((3, 2) if path.stem.endswith('-climb-grid') else (6, 1))
    output_cols, output_rows = (4, 2) if kind == 'poses' else (6, 1)
    with Image.open(path) as source:
        original_size = source.size
        expected = cols / rows
        if abs(source.width / source.height / expected - 1) > 0.005:
            raise InvalidArt(f'{kind} expected {cols}:{rows} aspect, got {source.width}x{source.height}')
        # Resize the entire regular grid: fractional master cell edges stay aligned.
        sheet = key_alpha(source, key).resize((cols * CELL, rows * CELL), Image.Resampling.LANCZOS)
    frames = []
    summaries = []
    for index in range(cols * rows):
        x, y = (index % cols) * CELL, (index // cols) * CELL
        frame = sheet.crop((x, y, x + CELL, y + CELL))
        shift = 0
        if kind == 'poses' and index in GROUNDED_POSES:
            shift = SOLE - visible_bounds(frame)[3]
            if abs(shift) > max_shift:
                raise InvalidArt(f'grounding requires {shift}px shift (limit {max_shift}); regenerate framing')
            if not defer_grounding:
                frame, shift = grounded(frame, max_shift)
        summaries.append({**frame_summary(frame, index, allow_tight), 'groundingShift': shift})
        frames.append(frame)
    minimum_diff = None
    if kind == 'climb':
        minimum_diff = min(frame_diff(frames[a], frames[b]) for a in range(6) for b in range(a + 1, 6))
        if minimum_diff <= MIN_FRAME_DIFF:
            raise InvalidArt(f'climb frames repeat or barely differ: minimum {minimum_diff}, need >{MIN_FRAME_DIFF}')
    result = Image.new('RGBA', (output_cols * CELL, output_rows * CELL))
    for index, frame in enumerate(frames):
        result.paste(frame, ((index % output_cols) * CELL, (index // output_cols) * CELL))
    return result, {'input': str(path), 'inputSize': original_size, 'outputSize': result.size,
                    'frames': summaries, 'groundingDeferred': defer_grounding,
                    'minClimbDifferencePixels': minimum_diff}


def visible_area(cell: Image.Image) -> int:
    return int(np.count_nonzero(np.asarray(cell)[:, :, 3] > VISIBLE_ALPHA))


def scaled_about_root(cell: Image.Image, factor: float) -> Image.Image:
    """Uniformly scale one frame about the foot anchor (feet stay on the sole row)."""
    if abs(factor - 1) <= 0.02:
        return cell
    transform = (1 / factor, 0, ROOT[0] - ROOT[0] / factor, 0, 1 / factor, ROOT[1] - ROOT[1] / factor)
    return cell.transform(cell.size, Image.Transform.AFFINE, transform, Image.Resampling.BICUBIC)


def translated(cell: Image.Image, dx: int, dy: int) -> tuple[Image.Image, int, int]:
    """Translate a frame, clamping the move so it keeps a 2px gutter."""
    left, top, right, bottom = visible_bounds(cell)
    dx = max(min(dx, CELL - 2 - right), 2 - left)
    dy = max(min(dy, CELL - 2 - bottom), 2 - top)
    result = Image.new('RGBA', cell.size)
    result.alpha_composite(cell, (dx, dy))
    return result, dx, dy


def body_mass(cell: Image.Image) -> np.ndarray:
    """The frame's alpha blurred, so torso and head outweigh thin limbs."""
    alpha = Image.fromarray(np.asarray(cell)[:, :, 3]).filter(ImageFilter.GaussianBlur(BODY_BLUR))
    return np.asarray(alpha).astype(np.float32) / 255


def body_offset(reference: np.ndarray, current: np.ndarray, limit: int = STABILISE_SHIFT) -> tuple[int, int]:
    """The (dx, dy) that moves `current`'s body onto `reference`'s: the cross-correlation peak."""
    correlation = np.fft.fftshift(np.fft.irfft2(np.fft.rfft2(reference) * np.conj(np.fft.rfft2(current)),
                                                s=reference.shape))
    cy, cx = np.array(correlation.shape) // 2
    window = correlation[cy - limit:cy + limit + 1, cx - limit:cx + limit + 1]
    dy, dx = np.unravel_index(int(np.argmax(window)), window.shape)
    return int(dx) - limit, int(dy) - limit


def head_centre_x(cell: Image.Image) -> float:
    """Column centroid of the figure's top rows (the head), which a stride must not swing."""
    visible = np.asarray(cell)[:, :, 3] > VISIBLE_ALPHA
    _, top, _, bottom = visible_bounds(cell)
    return float(np.where(visible[top:top + max(1, int((bottom - top) * HEAD_FRACTION))])[1].mean())


def stabilise_climb(frames: list[Image.Image]) -> tuple[list[Image.Image], list[dict]]:
    """Pin every climb frame's body onto frame 1's, so only the limbs move in the loop.

    Generated climb rows come from separate renders whose body position and
    size drift by several pixels; the engine crossfades frame boundaries, so
    that drift ghosts the whole figure. Each later frame is scaled about the
    anchor to frame 1's visible mass, then translated to the correlation peak
    of the blurred bodies. Hands are thin, so the peak is the torso.
    """
    reference = body_mass(frames[0])
    area = visible_area(frames[0])
    result = [frames[0]]
    moves = [{'scale': 1.0, 'dx': 0, 'dy': 0}]
    for frame in frames[1:]:
        factor = float(np.clip(np.sqrt(area / visible_area(frame)), *CLIMB_SCALE_RANGE))
        frame = scaled_about_root(frame, factor)
        frame, dx, dy = translated(frame, *body_offset(reference, body_mass(frame)))
        result.append(frame)
        moves.append({'scale': round(factor, 3), 'dx': dx, 'dy': dy})
    sole = SOLE - max(visible_bounds(frame)[3] for frame in result)
    result = [translated(frame, 0, sole)[0] for frame in result]
    return result, [{**move, 'dy': move['dy'] + sole} for move in moves]


def alpha_diff(first: np.ndarray, second: np.ndarray) -> int:
    return int(np.count_nonzero(first ^ second))


def smoothest_cycle(frames: list[Image.Image]) -> tuple[list[Image.Image], dict]:
    """Re-sequence the six climb frames into the loop with the smallest steps.

    A generated climb grid is a set of poses, not a sequence: its rows repeat
    poses and jump between them in no order. The loop the engine plays uses
    every frame once, each either as drawn or mirrored (a rear-view
    hand-over-hand is symmetric, so a mirrored frame is the other hand's
    reach), in the order that keeps every consecutive pair as close as
    possible, measured as the silhouette (visible-alpha) difference, while
    every pair in the loop stays distinct by the repeat guard's pixel measure
    (MIN_FRAME_DIFF). Frame 1 keeps its place and its side, so the output is
    deterministic and the stabiliser's reference body is unchanged.
    """
    pool = frames + [ImageOps.mirror(frame) for frame in frames]
    masks = [np.asarray(frame)[:, :, 3] > VISIBLE_ALPHA for frame in pool]
    diffs = np.array([[alpha_diff(a, b) for b in masks] for a in masks])
    # Distinctness uses the same measure as the repeat guard, so a loop that
    # passes here is one compile_sheet would also accept.
    same = np.array([[frame_diff(a, b) <= MIN_FRAME_DIFF for b in pool] for a in pool])
    before = [int(diffs[i, (i + 1) % 6]) for i in range(6)]
    best: tuple[tuple[int, int], tuple[int, ...]] | None = None
    for rest in itertools.permutations(range(1, 6), 5):
        for flips in itertools.product((0, 6), repeat=5):
            order = (0, *(index + flip for index, flip in zip(rest, flips)))
            if any(same[a, b] for a, b in itertools.combinations(order, 2)):
                continue
            steps = [int(diffs[order[i], order[(i + 1) % 6]]) for i in range(6)]
            key = (max(steps), sum(steps))
            if best is None or key < best[0]:
                best = (key, order)
    if best is None:
        raise InvalidArt('climb frames cannot form a loop of six distinct frames')
    _, order = best
    after = [int(diffs[order[i], order[(i + 1) % 6]]) for i in range(6)]
    return [pool[index] for index in order], {
        'order': [f'{index % 6 + 1}{"m" if index >= 6 else ""}' for index in order],
        'stepPixelsBefore': before, 'stepPixelsAfter': after,
    }


def stabilise_run(frames: list[Image.Image]) -> tuple[list[Image.Image], list[dict]]:
    """Match both run strides to the idle's mass and head column, then re-ground them.

    A stride rendered smaller than the idle reads as a hop every other step,
    and one whose head sits off the anchor swings side to side. Feet stay on
    the sole row, so the fix is a scale about the anchor plus a horizontal move.
    """
    area, centre = visible_area(frames[0]), head_centre_x(frames[0])
    result = list(frames)
    moves = []
    for index in (1, 2):
        factor = float(np.clip(np.sqrt(area / visible_area(frames[index])), *RUN_SCALE_RANGE))
        frame = scaled_about_root(frames[index], factor)
        frame, dx, _ = translated(frame, int(round(centre - head_centre_x(frame))), 0)
        frame, _ = grounded(frame, MAX_SHIFT)
        result[index] = frame
        moves.append({'frame': index + 1, 'scale': round(factor, 3), 'dx': dx})
    return result, moves


def split_frames(sheet: Image.Image, kind: str) -> list[Image.Image]:
    cols, count = (4, 8) if kind == 'poses' else (6, 6)
    return [sheet.crop(((i % cols) * CELL, (i // cols) * CELL,
                        (i % cols + 1) * CELL, (i // cols + 1) * CELL)) for i in range(count)]


def scale_limit(bounds: tuple[int, int, int, int]) -> float:
    left, top, right, bottom = bounds
    extents = ((ROOT[0] - left, ROOT[0] - TARGET_GUTTER),
               (right - ROOT[0], CELL - 1 - TARGET_GUTTER - ROOT[0]),
               (ROOT[1] - top, ROOT[1] - TARGET_GUTTER),
               (bottom - ROOT[1], CELL - 1 - TARGET_GUTTER - ROOT[1]))
    return min([1.0] + [space / extent for extent, space in extents if extent > 0])


def normalize_pair(compiled: dict) -> tuple[dict, float]:
    """One common factor about the shared foot anchor, then per-cycle stabilisation.

    The shared factor keeps every pose at the character's one body scale. The
    stabilisers afterwards only correct generation drift inside a cycle (run
    strides against the idle, climb frames against frame 1) so the engine's
    crossfades move limbs, not the whole figure.
    """
    frames = {kind: split_frames(sheet, kind) for kind, (sheet, _) in compiled.items()}
    climb_shift = SOLE - max(visible_bounds(frame)[3] for frame in frames['climb'])
    if abs(climb_shift) > MAX_SHIFT:
        raise InvalidArt(f'climb sheet needs {climb_shift}px anchor shift (limit {MAX_SHIFT})')
    shifts = {'poses': 0, 'climb': climb_shift}
    frame_shifts = {
        kind: [shifts[kind] + (compiled[kind][1]['frames'][i]['groundingShift']
                              if compiled[kind][1].get('groundingDeferred') else 0)
               for i in range(len(group))]
        for kind, group in frames.items()
    }
    bounds = [(left, top + frame_shifts[kind][i], right, bottom + frame_shifts[kind][i])
              for kind, group in frames.items() for i, frame in enumerate(group)
              for left, top, right, bottom in [visible_bounds(frame)]]
    scale = min(scale_limit(bound) for bound in bounds)
    if scale < MIN_SHARED_SCALE:
        raise InvalidArt(f'shared framing would shrink to {scale:.3f}; regenerate at consistent scale')
    result = {}
    for kind, group in frames.items():
        normalized = []
        for i, frame in enumerate(group):
            shift = frame_shifts[kind][i]
            transform = (1 / scale, 0, ROOT[0] - ROOT[0] / scale,
                         0, 1 / scale, ROOT[1] - ROOT[1] / scale - shift)
            normalized.append(frame.transform(frame.size, Image.Transform.AFFINE, transform,
                                              Image.Resampling.BICUBIC)
                              if scale < 1 or shift else frame)
        report = dict(compiled[kind][1])
        if kind == 'climb':
            normalized, report['cycle'] = smoothest_cycle(normalized)
            normalized, moves = stabilise_climb(normalized)
        else:
            normalized, moves = stabilise_run(normalized)
        report['wholeSheetShiftY'] = shifts[kind]
        report['stabilised'] = moves
        report['frames'] = [{**frame_summary(frame, i),
                             'groundingShift': report['frames'][i]['groundingShift']}
                            for i, frame in enumerate(normalized)]
        if kind == 'climb':
            report['minClimbDifferencePixels'] = min(frame_diff(normalized[a], normalized[b])
                                                   for a in range(6) for b in range(a + 1, 6))
            if report['minClimbDifferencePixels'] <= MIN_FRAME_DIFF:
                raise InvalidArt('climb frames insufficiently distinct after shared scaling')
        else:
            soles = [visible_bounds(normalized[i])[3] for i in GROUNDED_POSES]
            if not all(170 <= row <= 175 for row in soles):
                raise InvalidArt(f'grounded soles outside runtime tolerance after normalization: {soles}')
        sheet = Image.new('RGBA', compiled[kind][0].size)
        cols = 4 if kind == 'poses' else 6
        for i, frame in enumerate(normalized):
            sheet.paste(frame, ((i % cols) * CELL, (i // cols) * CELL))
        result[kind] = (sheet, report)
    return result, scale


def process_character(character: str, input_root: Path, output_root: Path, key: str | None = None,
                      max_shift: int = MAX_SHIFT, check_only: bool = False) -> dict:
    if character not in IDS:
        raise InvalidArt(f'unknown character: {character}')
    skin = character + '-void'
    chosen = key or ('green' if character in GREEN_KEY_IDS else 'magenta')
    compiled = {}
    for kind in ('poses', 'climb'):
        path = input_root / skin / f'{skin}-{kind}.png'
        grid = input_root / skin / f'{skin}-climb-grid.png'
        if kind == 'climb' and grid.exists():
            path = grid
        compiled[kind] = compile_sheet(path, kind, chosen, max_shift, allow_tight=True, defer_grounding=True)
    compiled, shared_scale = normalize_pair(compiled)
    report = {'id': skin, 'status': 'validated', 'key': chosen, 'checkOnly': check_only,
              'sheets': {kind: details for kind, (_, details) in compiled.items()},
              'sharedScale': shared_scale, 'scaleAnchor': ROOT,
              'visualReviewRequired': ['portrait identity and palette', 'skull headTop measurement',
                                       'pose order and constant body scale', 'hand-over-hand climb direction',
                                       'key spill and palette collisions']}
    if check_only:
        return report
    output_root.mkdir(parents=True, exist_ok=True)
    # Finish encoding both files before replacing either output; failed validation writes nothing.
    with tempfile.TemporaryDirectory(prefix='paid-art-', dir=output_root) as temp:
        for kind, (sheet, _) in compiled.items():
            filename = f'{skin}-{kind}-192.png'
            sheet.save(Path(temp) / filename, optimize=True)
            report['sheets'][kind]['outputBytes'] = (Path(temp) / filename).stat().st_size
        for kind in compiled:
            filename = f'{skin}-{kind}-192.png'
            (Path(temp) / filename).replace(output_root / filename)
    return report


def parser() -> argparse.ArgumentParser:
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('characters', nargs='*', metavar='CHARACTER', help='One or more base character ids')
    cli.add_argument('--all', action='store_true', help='Validate/process every one of the 18 identities')
    cli.add_argument('--input-root', type=Path, default=REPO / 'paid-characters/art')
    cli.add_argument('--output-root', type=Path, default=REPO / 'app/public/climb')
    cli.add_argument('--key', choices=KEYS, help='Override the per-character background key')
    cli.add_argument('--max-ground-shift', type=int, default=MAX_SHIFT)
    cli.add_argument('--check-only', action='store_true', help='Validate without writing images')
    cli.add_argument('--report', type=Path, help='Write machine-readable batch results')
    return cli


def main() -> int:
    cli = parser()
    args = cli.parse_args()
    if not args.all and not args.characters:
        cli.error('supply one or more characters or --all')
    if args.max_ground_shift < 0 or args.max_ground_shift > MAX_SHIFT:
        cli.error(f'--max-ground-shift must be between 0 and {MAX_SHIFT}')
    if any(character not in IDS for character in args.characters):
        cli.error('unknown character; use a known base id (without -void)')
    selected = IDS if args.all else tuple(dict.fromkeys(args.characters))
    results = []
    for character in selected:
        try:
            results.append(process_character(character, args.input_root, args.output_root, args.key,
                                             args.max_ground_shift, args.check_only))
        except (InvalidArt, OSError) as error:
            results.append({'id': character + '-void', 'status': 'failed', 'error': str(error)})
    summary = {'passed': sum(row['status'] == 'validated' for row in results),
               'failed': sum(row['status'] == 'failed' for row in results), 'characters': results}
    encoded = json.dumps(summary, indent=2) + '\n'
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(encoded)
    sys.stdout.write(encoded)
    return 1 if summary['failed'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
