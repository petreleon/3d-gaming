#!/usr/bin/env python3
"""
Script Blender pentru Spargerea unei Animații într-o Matrice de Imagini (Grid R x C)
Destinat Subagenților Verificatori (`subagent-verificator`, `verificator-animatii-3d`).

Poate fi rulat prin `blender:execute_blender_code` sau din CLI:
  blender -b <fisier.blend> -P scripts/blender_animation_matrix.py -- --rows 4 --cols 4 --start 1 --end 48 --out /tmp/animation-matrix
"""
import os
import sys
import math


def render_blender_animation_matrix(
    out_dir="/tmp/animation-matrix",
    action_name="blender_anim",
    frame_start=None,
    frame_end=None,
    rows=4,
    cols=4,
    cell_width=384,
    cell_height=384,
):
    import bpy
    import numpy as np

    os.makedirs(out_dir, exist_ok=True)
    scene = bpy.context.scene

    f_start = frame_start if frame_start is not None else scene.frame_start
    f_end = frame_end if frame_end is not None else scene.frame_end
    total_cells = rows * cols

    orig_frame = scene.frame_current
    orig_res_x = scene.render.resolution_x
    orig_res_y = scene.render.resolution_y
    orig_pct = scene.render.resolution_percentage
    orig_filepath = scene.render.filepath

    scene.render.resolution_x = cell_width
    scene.render.resolution_y = cell_height
    scene.render.resolution_percentage = 100

    frame_paths = []
    try:
        for k in range(total_cells):
            alpha = k / float(max(1, total_cells - 1))
            frame_num = int(round(f_start + alpha * (f_end - f_start)))
            scene.frame_set(frame_num)

            frame_file = os.path.join(
                out_dir, f"frame_{action_name}_{k:02d}_f{frame_num:04d}.png"
            )
            scene.render.filepath = frame_file
            bpy.ops.render.render(write_still=True)
            frame_paths.append((k, frame_num, alpha, frame_file))

        # Compunem matricea R x C direct prin bpy.data.images + numpy (fără dependențe externe)
        grid_w = cols * cell_width
        grid_h = rows * cell_height
        canvas = np.zeros((grid_h, grid_w, 4), dtype=np.float32)
        canvas[:, :, 3] = 1.0

        for k, frame_num, alpha, fpath in frame_paths:
            r = k // cols
            c = k % cols
            img = bpy.data.images.load(fpath)
            pixels = np.array(img.pixels[:], dtype=np.float32).reshape(
                (cell_height, cell_width, 4)
            )
            bpy.data.images.remove(img)

            # În Blender, originea imaginii (rândul 0) este jos; plasăm rândul r de sus în jos
            inv_r = (rows - 1) - r
            y0 = inv_r * cell_height
            x0 = c * cell_width

            # Chenar discret de 2px pe marginea celulei
            pixels[0:2, :, :3] = (0.22, 0.74, 0.97)
            pixels[-2:, :, :3] = (0.20, 0.25, 0.33)
            pixels[:, 0:2, :3] = (0.20, 0.25, 0.33)
            pixels[:, -2:, :3] = (0.20, 0.25, 0.33)

            canvas[y0 : y0 + cell_height, x0 : x0 + cell_width, :] = pixels

        matrix_name = f"matrix_{action_name}_{rows}x{cols}"
        matrix_img = bpy.data.images.new(
            matrix_name, width=grid_w, height=grid_h, alpha=True
        )
        matrix_img.pixels = canvas.ravel().tolist()
        matrix_path = os.path.join(out_dir, f"{matrix_name}.png")
        matrix_img.filepath_raw = matrix_path
        matrix_img.file_format = "PNG"
        matrix_img.save()
        bpy.data.images.remove(matrix_img)

        print(f"Matrice Animație Blender ({rows}x{cols}) salvată: {matrix_path}")
        return matrix_path
    finally:
        scene.frame_set(orig_frame)
        scene.render.resolution_x = orig_res_x
        scene.render.resolution_y = orig_res_y
        scene.render.resolution_percentage = orig_pct
        scene.render.filepath = orig_filepath


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    out_dir = "/tmp/animation-matrix"
    rows, cols = 4, 4
    f_start, f_end = None, None
    action = "blender_anim"

    i = 0
    while i < len(argv):
        if argv[i] == "--out" and i + 1 < len(argv):
            out_dir = argv[i + 1]
            i += 2
        elif argv[i] == "--rows" and i + 1 < len(argv):
            rows = int(argv[i + 1])
            i += 2
        elif argv[i] == "--cols" and i + 1 < len(argv):
            cols = int(argv[i + 1])
            i += 2
        elif argv[i] == "--start" and i + 1 < len(argv):
            f_start = int(argv[i + 1])
            i += 2
        elif argv[i] == "--end" and i + 1 < len(argv):
            f_end = int(argv[i + 1])
            i += 2
        elif argv[i] == "--action" and i + 1 < len(argv):
            action = argv[i + 1]
            i += 2
        else:
            i += 1

    render_blender_animation_matrix(
        out_dir=out_dir,
        action_name=action,
        frame_start=f_start,
        frame_end=f_end,
        rows=rows,
        cols=cols,
    )
