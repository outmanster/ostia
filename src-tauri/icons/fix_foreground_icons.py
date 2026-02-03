from PIL import Image
import os

# Configuration
SOURCE_LOGO = "icon.png"
OUTPUT_BASE_DIR = "../gen/android/app/src/main/res"

# Android mipmap dimensions (width x height)
MIPMAP_SIZES = {
    "mipmap-mdpi": 108,
    "mipmap-hdpi": 162,
    "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324,
    "mipmap-xxxhdpi": 432,
}

# The safe zone is roughly 66% of the icon (diameter).
# We want the logo to fit comfortably within this safe zone.
# Let's scale the logo to 60% of the canvas size to be safe and have some padding.
LOGO_SCALE_FACTOR = 0.60

def generate_foreground_icons():
    if not os.path.exists(SOURCE_LOGO):
        print(f"Error: Source logo '{SOURCE_LOGO}' not found.")
        return

    img = Image.open(SOURCE_LOGO).convert("RGBA")
    print(f"Loaded source logo: {SOURCE_LOGO} ({img.size})")

    for folder_name, size in MIPMAP_SIZES.items():
        output_dir = os.path.join(OUTPUT_BASE_DIR, folder_name)
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)
            print(f"Created directory: {output_dir}")

        # Create transparent canvas
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))

        # Resize logo
        target_logo_size = int(size * LOGO_SCALE_FACTOR)
        resized_logo = img.resize((target_logo_size, target_logo_size), Image.Resampling.LANCZOS)

        # Calculate position to center the logo
        offset = (size - target_logo_size) // 2
        
        # Paste logo onto canvas
        canvas.paste(resized_logo, (offset, offset), resized_logo)

        # Save
        output_path = os.path.join(output_dir, "ic_launcher_foreground.png")
        canvas.save(output_path, "PNG")
        print(f"Generated: {output_path} ({size}x{size})")

if __name__ == "__main__":
    print("Generating Android foreground icons with padding...")
    generate_foreground_icons()
    print("Done.")
