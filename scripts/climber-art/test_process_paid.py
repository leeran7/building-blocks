"""Real image fixtures exercise compiler failure guards and output contracts."""
import tempfile
import unittest
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from process_paid import InvalidArt, compile_sheet, grounded, key_alpha, process_character, parser, visible_bounds, frame_summary


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
            self.assertEqual(soles, sorted(soles))
            self.assertGreaterEqual(soles[-1] - soles[0], 4)
            self.assertEqual(soles[-1], 172)
            self.assertTrue(all(min(f['bounds'][:2]) > 0 for f in climbed))

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
