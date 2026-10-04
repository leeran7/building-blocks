"""Real image fixtures exercise compiler failure guards and output contracts."""
import tempfile
import unittest
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from process_paid import InvalidArt, compile_sheet, grounded, key_alpha, process_character, parser, stabilise_climb, visible_bounds, frame_summary


def atlas(cols, rows, varied=False, size=192):
    result = Image.new('RGBA', (cols * size, rows * size), (255, 0, 255, 255))
    draw = ImageDraw.Draw(result)
    for index in range(cols * rows):
        x, y = (index % cols) * size, (index // cols) * size
        color = ((35 + index * 35) % 255, (60 + index * 65) % 255, 40, 255) if varied else (20, 90, 210, 255)
        draw.rectangle((x + 55, y + 30, x + 135, y + 174), fill=color)
    return result


class PaidArtTests(unittest.TestCase):
    def test_alpha_and_green_key_keep_non_key_identity_colors(self):
        source = Image.new('RGBA', (192, 192), (0, 255, 0, 255))
        colors = [(210, 25, 200, 255), (30, 30, 30, 255), (245, 150, 20, 255)]
        for index, color in enumerate(colors):
            source.putpixel((50 + index, 50), color)
        output = key_alpha(source, 'green')
        self.assertEqual(output.getpixel((0, 0)), (0, 0, 0, 0))
        for index, color in enumerate(colors):
            self.assertEqual(output.getpixel((50 + index, 50)), color)
        transparent = Image.new('RGBA', (192, 192))
        transparent.putpixel((96, 96), (255, 0, 255, 128))
        self.assertEqual(key_alpha(transparent, 'magenta').tobytes(), transparent.tobytes())

    def test_visibility_and_gutter_boundaries(self):
        cell = Image.new('RGBA', (192, 192))
        ImageDraw.Draw(cell).rectangle((2, 2, 11, 11), fill=(30, 60, 200, 40))
        with self.assertRaisesRegex(InvalidArt, 'empty'):
            visible_bounds(cell)
        ImageDraw.Draw(cell).rectangle((2, 2, 11, 11), fill=(30, 60, 200, 41))
        self.assertEqual(frame_summary(cell, 0)['minGutter'], 2)
        cell.putpixel((2, 2), (0, 0, 0, 0))
        with self.assertRaisesRegex(InvalidArt, 'empty'):
            visible_bounds(cell)
        ImageDraw.Draw(cell).rectangle((1, 2, 10, 11), fill=(30, 60, 200, 255))
        with self.assertRaisesRegex(InvalidArt, 'edge'):
            frame_summary(cell, 0)

    def test_grounding_accepts_limit_and_rejects_one_beyond(self):
        for bottom, valid in [(148, True), (147, False)]:
            cell = Image.new('RGBA', (192, 192))
            ImageDraw.Draw(cell).rectangle((50, 30, 140, bottom), fill=(30, 60, 200, 255))
            if valid:
                output, shift = grounded(cell, 24)
                self.assertEqual(shift, 24)
                self.assertEqual(visible_bounds(output)[3], 172)
            else:
                with self.assertRaisesRegex(InvalidArt, 'limit'):
                    grounded(cell, 24)

    def test_invalid_climb_preserves_both_existing_outputs(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            folder = root / 'masters/kestrel-void'
            folder.mkdir(parents=True)
            output = root / 'out'
            output.mkdir()
            for kind in ('poses', 'climb'):
                (output / f'kestrel-void-{kind}-192.png').write_bytes(b'original')
            atlas(4, 2).save(folder / 'kestrel-void-poses.png')
            atlas(6, 1).save(folder / 'kestrel-void-climb.png')
            with self.assertRaisesRegex(InvalidArt, 'repeat'):
                process_character('kestrel', folder.parent, output)
            self.assertEqual([p.read_bytes() for p in output.iterdir()], [b'original', b'original'])

    def test_cli_rejects_missing_unknown_and_invalid_shift_without_outputs(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / 'out'
            for args in ([], ['unknown'], ['kestrel', '--max-ground-shift', '-1'],
                         ['kestrel', '--max-ground-shift', '25'], ['kestrel', '--max-ground-shift', 'null']):
                result = subprocess.run([sys.executable, str(Path(__file__).with_name('process_paid.py')),
                                         '--output-root', str(output), *args], capture_output=True, text=True)
                self.assertEqual(result.returncode, 2, result.stderr)
                self.assertIn('error:', result.stderr)
                self.assertFalse(output.exists())

    def test_batch_parser_accepts_all_without_positional_ids(self):
        self.assertTrue(parser().parse_args(['--all', '--check-only']).all)

    def test_key_preserves_palette_and_rejects_wrong_background(self):
        source = atlas(4, 2)
        output = key_alpha(source, 'magenta')
        self.assertEqual(output.getpixel((0, 0)), (0, 0, 0, 0))
        self.assertEqual(output.getpixel((60, 60)), (20, 90, 210, 255))
        with self.assertRaisesRegex(InvalidArt, 'key absent'):
            key_alpha(source, 'green')

    def test_grounding_translates_without_scaling_and_rejects_large_shift(self):
        cell = Image.new('RGBA', (192, 192))
        ImageDraw.Draw(cell).rectangle((50, 30, 140, 170), fill=(30, 60, 200, 255))
        output, shift = grounded(cell, 24)
        self.assertEqual(shift, 2)
        self.assertEqual(np.sum(np.asarray(cell)[:, :, 3]), np.sum(np.asarray(output)[:, :, 3]))
        with self.assertRaisesRegex(InvalidArt, 'limit'):
            grounded(cell, 1)

    def test_approximate_resolution_and_climb_grid_pack_without_distortion(self):
        with tempfile.TemporaryDirectory() as temp:
            poses_path = Path(temp) / 'x-poses.png'
            atlas(4, 2).resize((1774, 887)).save(poses_path)
            poses, report = compile_sheet(poses_path, 'poses', 'magenta')
            self.assertEqual(poses.size, (768, 384))
            self.assertEqual([r['bounds'][3] for r in report['frames'][:3]], [172] * 3)
            self.assertEqual(report['frames'][5]['groundingShift'], 0)
            self.assertLess(report['frames'][7]['groundingShift'], 0)
            grid_path = Path(temp) / 'x-climb-grid.png'
            atlas(3, 2, varied=True).save(grid_path)
            climb, report = compile_sheet(grid_path, 'climb', 'magenta')
            self.assertEqual(climb.size, (1152, 192))
            self.assertGreater(report['minClimbDifferencePixels'], 1000)
            self.assertEqual(climb.getpixel((5 * 192 + 60, 60)), atlas(3, 2, varied=True).getpixel((2 * 192 + 60, 192 + 60)))

    def test_repeated_climb_and_wrong_aspect_fail(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'x-climb.png'
            atlas(6, 1).save(path)
            with self.assertRaisesRegex(InvalidArt, 'repeat'):
                compile_sheet(path, 'climb', 'magenta')
            atlas(3, 1, varied=True).save(path)
            with self.assertRaisesRegex(InvalidArt, 'aspect'):
                compile_sheet(path, 'climb', 'magenta')

    def test_common_scale_preserves_width_and_shorter_crouch(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp) / 'kestrel-void'
            folder.mkdir()
            poses = atlas(4, 2)
            draw = ImageDraw.Draw(poses)
            draw.rectangle((3 * 192, 192, 4 * 192 - 1, 383), fill=(255, 0, 255, 255))
            draw.rectangle((3 * 192 + 55, 192 + 100, 3 * 192 + 135, 192 + 174), fill=(20, 90, 210, 255))
            poses.save(folder / 'kestrel-void-poses.png')
            climb = atlas(6, 1, varied=True)
            draw = ImageDraw.Draw(climb)
            for i in range(6):
                color = climb.getpixel((i * 192 + 60, 60))
                draw.rectangle((i * 192 + 55, 1, i * 192 + 135, 177 + i), fill=color)
            climb.save(folder / 'kestrel-void-climb.png')
            report = process_character('kestrel', Path(temp), Path(temp) / 'out', check_only=True)
            self.assertGreater(report['sharedScale'], 0.65)
            self.assertLess(report['sharedScale'], 1)
            posed = report['sheets']['poses']['frames']
            climbed = report['sheets']['climb']['frames']
            bounds = [f['bounds'] for f in posed + climbed]
            widths = [b[2] - b[0] for b in bounds]
            self.assertLessEqual(max(widths) - min(widths), 1)
            self.assertLess(bounds[7][3] - bounds[7][1], (bounds[0][3] - bounds[0][1]) * 0.6)
            self.assertEqual(posed[7]['groundingShift'], -2)
            self.assertEqual(report['sheets']['climb']['wholeSheetShiftY'], -10)
            self.assertEqual(report['sheets']['poses']['wholeSheetShiftY'], 0)
            soles = [f['bounds'][3] for f in climbed]
            # Stabilised: the bodies line up, so the soles no longer stagger with the source heights.
            self.assertLessEqual(max(soles) - min(soles), 3)
            self.assertEqual(max(soles), 172)
            self.assertTrue(all(min(f['bounds'][:2]) > 0 for f in climbed))

    def test_climb_frames_are_pinned_onto_the_first_body(self):
        # Frames 4-6 come from a second generated row: same body, drawn 12px right, 7px up and 8% larger.
        climb = Image.new('RGBA', (6 * 192, 192), (255, 0, 255, 255))
        draw = ImageDraw.Draw(climb)
        for i in range(6):
            dx, dy, grow = (12, -7, 4) if i >= 3 else (0, 0, 0)
            x = i * 192 + 60 + dx
            draw.rectangle((x - grow, 40 + dy - grow, x + 70 + grow, 174 + dy), fill=(20, 90, 210, 255))
            # A hand that climbs the body's side a step per frame, so every frame differs.
            hand = (x - 30, 20 + dy + 44 * (i % 3)) if i % 2 else (x + 74, 20 + dy + 44 * (i % 3))
            draw.rectangle((hand[0], hand[1], hand[0] + 26, hand[1] + 40), fill=(240, 200, 30, 255))
        frames = [key_alpha(climb.crop((i * 192, 0, (i + 1) * 192, 192)), 'magenta') for i in range(6)]
        pinned, moves = stabilise_climb(frames)
        self.assertTrue(all(abs(m['dx']) <= 1 for m in moves[:3]), moves)
        self.assertTrue(all(-14 <= m['dx'] <= -10 for m in moves[3:]), moves)
        self.assertTrue(all(m['scale'] < 1 for m in moves[3:]), moves)
        # Even frames carry the hand on the right, so their left edge is the body's.
        lefts = [visible_bounds(frame)[0] for frame in pinned[::2]]
        self.assertLessEqual(max(lefts) - min(lefts), 4, lefts)
        self.assertEqual(max(visible_bounds(frame)[3] for frame in pinned), 172)
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp) / 'kestrel-void'
            folder.mkdir()
            atlas(4, 2).save(folder / 'kestrel-void-poses.png')
            climb.save(folder / 'kestrel-void-climb.png')
            report = process_character('kestrel', Path(temp), Path(temp) / 'out', check_only=True)
            climbed = report['sheets']['climb']
            # Through the whole pipeline (re-sequenced, possibly mirrored) every frame is pinned
            # within the row offset and the soles no longer stagger.
            self.assertEqual(len(climbed['stabilised']), 6)
            self.assertTrue(all(abs(m['dx']) <= 14 and m['scale'] <= 1 for m in climbed['stabilised']), climbed['stabilised'])
            soles = [f['bounds'][3] for f in climbed['frames']]
            self.assertLessEqual(max(soles) - min(soles), 3, soles)

    def test_climb_loop_is_the_smallest_step_sequence_of_distinct_frames(self):
        # Six poses of one body with a hand at ranks 0,3,1,4,5,2 (28px apart), odd ranks on the
        # other side: the generated order jumps, the smoothest loop climbs the hand one rank at
        # a time (mirroring frames so the hand stays on one side, as a rear view allows).
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp) / 'kestrel-void'
            folder.mkdir()
            atlas(4, 2).save(folder / 'kestrel-void-poses.png')
            climb = Image.new('RGBA', (6 * 192, 192), (255, 0, 255, 255))
            draw = ImageDraw.Draw(climb)
            ranks = [0, 3, 1, 4, 5, 2]
            for i, rank in enumerate(ranks):
                x = i * 192 + 60
                # Body and hand slots mirror onto themselves about the cell axis (x -> 191 - x).
                draw.rectangle((x + 1, 20, x + 70, 174), fill=(20, 90, 210, 255))
                hand_x = x - 33 if rank % 2 else x + 74
                top = 2 + rank * 28
                draw.rectangle((hand_x, top, hand_x + 30, top + 40), fill=(240, 200, 30, 255))
            climb.save(folder / 'kestrel-void-climb.png')
            report = process_character('kestrel', Path(temp), Path(temp) / 'out', check_only=True)
            cycle = report['sheets']['climb']['cycle']
            self.assertLess(sum(cycle['stepPixelsAfter']), sum(cycle['stepPixelsBefore']), cycle)
            self.assertEqual(cycle['order'][0], '1')
            self.assertEqual(len(set(cycle['order'])), 6)
            chosen = [ranks[int(name[0]) - 1] for name in cycle['order']]
            self.assertEqual(sorted(chosen), [0, 1, 2, 3, 4, 5], cycle)
            # Every step is one rank apart; the loop closes over the one long gap.
            steps = sorted(abs(chosen[(i + 1) % 6] - chosen[i]) for i in range(6))
            self.assertEqual(steps, [1, 1, 1, 1, 1, 5], cycle)

    def test_run_strides_match_the_idle_mass_and_head_column(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp) / 'kestrel-void'
            folder.mkdir()
            poses = atlas(4, 2)
            draw = ImageDraw.Draw(poses)
            # run-b (cell 2) drawn 15% shorter and narrower, and its head 14px to the right.
            draw.rectangle((2 * 192, 0, 3 * 192 - 1, 191), fill=(255, 0, 255, 255))
            draw.rectangle((2 * 192 + 69, 52, 2 * 192 + 137, 174), fill=(20, 90, 210, 255))
            poses.save(folder / 'kestrel-void-poses.png')
            atlas(6, 1, varied=True).save(folder / 'kestrel-void-climb.png')
            report = process_character('kestrel', Path(temp), Path(temp) / 'out', check_only=True)
            moves = report['sheets']['poses']['stabilised']
            self.assertEqual([m['frame'] for m in moves], [2, 3])
            self.assertAlmostEqual(moves[0]['scale'], 1.0, delta=0.02)
            self.assertGreater(moves[1]['scale'], 1.1)
            self.assertLess(moves[1]['dx'], -8)
            frames = report['sheets']['poses']['frames']
            self.assertIn(frames[2]['bounds'][3], range(170, 176))
            heights = [f['bounds'][3] - f['bounds'][1] for f in frames[:3]]
            self.assertLessEqual(max(heights) - min(heights), 3, heights)

    def test_standing_grounding_is_fused_before_shared_scale_without_clipping(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp) / 'kestrel-void'
            folder.mkdir()
            poses = atlas(4, 2)
            draw = ImageDraw.Draw(poses)
            # High reach would lose its top if the -17px shift were rasterized first.
            draw.rectangle((576, 0, 767, 191), fill=(255, 0, 255, 255))
            draw.rectangle((631, 8, 711, 189), fill=(20, 90, 210, 255))
            draw.rectangle((631, 8, 711, 12), fill=(245, 150, 20, 255))
            # Crouch is deliberately shorter, still grounded independently.
            draw.rectangle((576, 192, 767, 383), fill=(255, 0, 255, 255))
            draw.rectangle((631, 262, 711, 378), fill=(20, 90, 210, 255))
            poses.save(folder / 'kestrel-void-poses.png')
            atlas(6, 1, varied=True).save(folder / 'kestrel-void-climb.png')
            report = process_character('kestrel', Path(temp), Path(temp) / 'out')
            self.assertGreater(report['sharedScale'], 0.85)
            frames = report['sheets']['poses']['frames']
            for i in (0, 1, 2, 3, 4, 6, 7):
                self.assertIn(frames[i]['bounds'][3], range(170, 176))
            self.assertEqual(frames[3]['groundingShift'], -17)
            self.assertEqual(frames[7]['groundingShift'], -14)
            self.assertEqual(frames[5]['groundingShift'], 0)
            self.assertLess(frames[7]['bounds'][3] - frames[7]['bounds'][1],
                            frames[0]['bounds'][3] - frames[0]['bounds'][1])
            with Image.open(Path(temp) / 'out/kestrel-void-poses-192.png') as image:
                reach = np.asarray(image.crop((576, 0, 768, 192)))
                orange = (reach[:, :, 0] > 200) & (reach[:, :, 1] > 100) & (reach[:, :, 2] < 60)
                self.assertGreater(int(orange.sum()), 100)

    def test_incomplete_character_writes_nothing(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp) / 'masters/kestrel-void'
            folder.mkdir(parents=True)
            atlas(4, 2).save(folder / 'kestrel-void-poses.png')
            output = Path(temp) / 'output'
            with self.assertRaises(FileNotFoundError):
                process_character('kestrel', folder.parent, output)
            self.assertFalse(output.exists())
            atlas(6, 1, varied=True).save(folder / 'kestrel-void-climb.png')
            report = process_character('kestrel', folder.parent, output)
            self.assertEqual(report['status'], 'validated')
            self.assertEqual(len(list(output.glob('*.png'))), 2)
            with Image.open(output / 'kestrel-void-climb-192.png') as image:
                self.assertEqual(image.size, (1152, 192))


if __name__ == '__main__':
    unittest.main()
