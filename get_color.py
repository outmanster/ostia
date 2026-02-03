from PIL import Image
import os

def get_bg_color(image_path):
    img = Image.open(image_path).convert("RGBA")
    # Get color of top-left pixel
    color = img.getpixel((0, 0))
    return '#{:02x}{:02x}{:02x}'.format(color[0], color[1], color[2])

if __name__ == "__main__":
    icon_path = os.path.join("src-tauri", "icons", "icon.png")
    print(f"BG_COLOR:{get_bg_color(icon_path)}")
