from PIL import Image
import sys

def visualize_alpha():
    path = "src-tauri/icons/icon.ico"
    try:
        img = Image.open(path)
        print(f"Opening {path}")
        print(f"Format: {img.format}, Mode: {img.mode}")
        if hasattr(img, 'n_frames'):
             print(f"Frames: {img.n_frames}")
        
        # Iterate over all frames in the ICO
        current_frame = 0
        while True:
            try:
                img.seek(current_frame)
                print(f"\n--- Frame {current_frame} size={img.size} ---")
                
                # Resize to small ASCII grid
                thumb = img.resize((32, 32))
                if thumb.mode != 'RGBA':
                    thumb = thumb.convert('RGBA')
                
                # Print ASCII art of Alpha channel
                # . = transparent, # = opaque
                for y in range(32):
                    line = ""
                    for x in range(32):
                        a = thumb.getpixel((x, y))[3]
                        if a < 10:
                            line += "."
                        elif a > 240:
                            line += "#"
                        else:
                            line += "+"
                    print(line)
                
                current_frame += 1
            except EOFError:
                break
                
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    visualize_alpha()
