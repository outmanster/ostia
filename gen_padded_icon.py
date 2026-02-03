
from PIL import Image
import os

def generate_icon():
    # User requested specific blue
    BG_COLOR = "#0085ff" 
    # Scale factor 0.8 (80%) for less padding, larger logo
    SCALE_FACTOR = 0.8  
    
    # Original transparent icon - NEVER OVERWRITE THIS
    INPUT_PATH = "new_logo_transparent.png"
    # Output for the padded version
    OUTPUT_PATH = "new_logo_padded.png"

    if not os.path.exists(INPUT_PATH):
        print(f"Error: {INPUT_PATH} not found!")
        # Try local path if running from src-tauri
        if os.path.exists("icons/icon.png"):
            INPUT_PATH = "icons/icon.png"
        else:
            return

    print(f"Processing {INPUT_PATH}...")
    
    # Open original icon
    icon = Image.open(INPUT_PATH).convert("RGBA")
    width, height = icon.size
    
    # Create new background image
    new_bg = Image.new("RGBA", (width, height), BG_COLOR)
    
    # Calculate resizing
    new_w = int(width * SCALE_FACTOR)
    new_h = int(height * SCALE_FACTOR)
    
    # High quality resampling
    icon_resized = icon.resize((new_w, new_h), Image.Resampling.LANCZOS)
    
    # Center it
    x = (width - new_w) // 2
    y = (height - new_h) // 2
    
    # Paste logo onto background (using alpha channel as mask)
    new_bg.paste(icon_resized, (x, y), icon_resized)
    
    # Save
    new_bg.save(OUTPUT_PATH)
    print(f"Generated {OUTPUT_PATH} successfully!")

if __name__ == "__main__":
    generate_icon()
