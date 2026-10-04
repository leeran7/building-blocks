#!/usr/bin/env python3
"""Validate and compile generated paid character sheets; never modify masters."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
import tempfile

import numpy as np
from PIL import Image

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
    """One common factor about the shared foot anchor; never scale individual poses."""
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
        report['wholeSheetShiftY'] = shifts[kind]
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
