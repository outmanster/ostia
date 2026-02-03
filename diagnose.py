
import os

files = [
    r'd:\Project\Ostia\src\components\auth\SetMasterPasswordDialog.tsx',
    r'd:\Project\Ostia\src\components\auth\UnlockDialog.tsx',
    r'd:\Project\Ostia\src\components\contacts\AddContactDialog.tsx'
]

for f_path in files:
    if not os.path.exists(f_path):
        print(f"File not found: {f_path}")
        continue
    
    with open(f_path, 'rb') as f:
        content = f.read()
    
    size = len(content)
    # Check for null bytes
    null_count = content.count(b'\x00')
    # Check if file ends abruptly (e.g. no trailing brace)
    has_closing_brace = b'}' in content[-100:]
    
    print(f"File: {os.path.basename(f_path)}")
    print(f"  Size: {size} bytes")
    print(f"  Null bytes: {null_count}")
    print(f"  Has closing brace near end: {has_closing_brace}")
    if size > 0:
        print(f"  Last 20 bytes: {repr(content[-20:])}")
    print("-" * 20)
