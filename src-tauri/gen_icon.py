
from PIL import Image
import os

def generate_icon():
    # Configuration
    # 这里使用一个比较通用的蓝色，如果你有特定的色值 (比如 #007AFF)，请在这里修改
    BG_COLOR = "#4aa1ff" 
    SCALE_FACTOR = 0.7  # Logo 缩放到原图的 70%
    INPUT_PATH = "icons/icon.png"
    OUTPUT_PATH = "icons/icon_ios_blue.png"

    if not os.path.exists(INPUT_PATH):
        print(f"Error: {INPUT_PATH} not found!")
        return

    # Open original icon
    icon = Image.open(INPUT_PATH).convert("RGBA")
    width, height = icon.size
    
    # Create new background image
    # iOS icon should be 1024x1024, but we keep original resolution for now
    # (tauri icon command will handle resizing)
    new_bg = Image.new("RGBA", (width, height), BG_COLOR)
    
    # Calculate resizing
    new_w = int(width * SCALE_FACTOR)
    new_h = int(height * SCALE_FACTOR)
    icon_resized = icon.resize((new_w, new_h), Image.Resampling.LANCZOS)
    
    # Calculate centering position
    x = (width - new_w) // 2
    y = (height - new_h) // 2
    
    # Paste logo onto background
    new_bg.paste(icon_resized, (x, y), icon_resized)
    
    # Save
    new_bg.save(OUTPUT_PATH)
    print(f"Generated {OUTPUT_PATH} successfully!")

if __name__ == "__main__":
    generate_icon()
