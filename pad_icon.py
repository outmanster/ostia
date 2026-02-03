from PIL import Image
import os

import shutil

def pad_image(input_path, output_path, target_ratio=0.6):
    img = Image.open(input_path).convert("RGBA")
    width, height = img.size
    
    # Calculate new size based on target ratio (logo size / total size)
    new_size = int(max(width, height) / target_ratio)
    
    # Create new transparent canvas
    new_img = Image.new("RGBA", (new_size, new_size), (0, 0, 0, 0))
    
    # Calculate paste position (center)
    left = (new_size - width) // 2
    top = (new_size - height) // 2
    
    new_img.paste(img, (left, top), img)
    new_img.save(output_path)
    print(f"Padded icon saved to {output_path} (New size: {new_size}x{new_size})")

def compose_on_bg(logo_path, output_path, bg_color=(1, 131, 253, 255), target_ratio=0.6, round_mask=False):
    logo = Image.open(logo_path).convert("RGBA")
    l_w, l_h = logo.size
    
    # Target size (standard for icons)
    total_size = 512
    new_logo_size = int(total_size * target_ratio)
    
    # Scale logo
    logo.thumbnail((new_logo_size, new_logo_size), Image.Resampling.LANCZOS)
    l_w, l_h = logo.size
    
    # Create background
    canvas = Image.new("RGBA", (total_size, total_size), bg_color)
    
    # Paste logo at center
    left = (total_size - l_w) // 2
    top = (total_size - l_h) // 2
    canvas.paste(logo, (left, top), logo)
    
    if round_mask:
        # Optional: Apply circular mask for ic_launcher_round
        from PIL import ImageDraw
        mask = Image.new("L", (total_size, total_size), 0)
        draw = ImageDraw.Draw(mask)
        draw.ellipse((0, 0, total_size, total_size), fill=255)
        
        # Transparent background for the container
        final = Image.new("RGBA", (total_size, total_size), (0, 0, 0, 0))
        final.paste(canvas, (0, 0), mask)
        canvas = final

    canvas.save(output_path)
    print(f"Composed icon saved to {output_path}")

def update_android_icons():
    # Use the non-transparent logo to avoid aliasing (锯齿)
    # The original new_logo.png already has the professional blue background
    res_path = os.path.join("src-tauri", "gen", "android", "app", "src", "main", "res")
    source = "new_logo.png" 
    bg_blue = (1, 131, 253, 255)
    
    # 1. Update Adaptive Foreground
    # We still pad it, but using the non-transparent one on its own background color
    # makes the transition from character to background seamless.
    temp_pad = "temp_android_foreground.png"
    compose_on_bg(source, temp_pad, bg_color=bg_blue, target_ratio=0.55)
    
    # 2. Update Legacy Icons
    temp_legacy = "temp_android_legacy.png"
    temp_round = "temp_android_round.png"
    compose_on_bg(source, temp_legacy, bg_color=bg_blue, target_ratio=0.55)
    compose_on_bg(source, temp_round, bg_color=bg_blue, target_ratio=0.55, round_mask=True)
    
    mips = ["mipmap-hdpi", "mipmap-mdpi", "mipmap-xhdpi", "mipmap-xxhdpi", "mipmap-xxxhdpi"]
    for mip in mips:
        mip_dir = os.path.join(res_path, mip)
        if os.path.exists(mip_dir):
            shutil.copy(temp_pad, os.path.join(mip_dir, "ic_launcher_foreground.png"))
            shutil.copy(temp_legacy, os.path.join(mip_dir, "ic_launcher.png"))
            shutil.copy(temp_round, os.path.join(mip_dir, "ic_launcher_round.png"))
            print(f"Updated {mip}")

if __name__ == "__main__":
    icon_path = "new_logo_transparent.png"
    output_path = os.path.join("src-tauri", "icons", "icon_padded.png")
    pad_image(icon_path, output_path, target_ratio=0.65)
    update_android_icons()
