
/**
 * Pick an image using Web native file input.
 * Works on mobile devices to trigger system file picker / camera.
 */
export function pickImageFromWeb(capture?: string): Promise<{ data: Uint8Array; filename: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    if (capture) {
      input.setAttribute("capture", capture);
    }
    input.style.display = "none";
    
    // Listen for file selection
    input.onchange = async () => {
        const file = input.files?.[0];
        if (file) {
            try {
                const buf = await file.arrayBuffer();
                resolve({
                    data: new Uint8Array(buf),
                    filename: file.name
                });
            } catch (err) {
                console.error("Failed to read file:", err);
                resolve(null);
            }
        } else {
            resolve(null);
        }
        if (document.body.contains(input)) {
            document.body.removeChild(input);
        }
    };

    // Handle cancellation:
    // It's hard to detect cancel reliably on all browsers. 
    // We rely on the user to try again if they cancelled.
    // To prevent memory leaks, we remove the input after a timeout if not triggered, 
    // but the file dialog blocks the thread in some browsers, so timeout might not work as expected.
    // A safe bet is to remove it on focus back, but for now we just append and forget (cleanup in onchange).
    // Better: listen to window focus.
    
    const onFocus = () => {
        // Wait a bit to allow change event to fire if a file was selected
        setTimeout(() => {
            if (document.body.contains(input)) {
                // If input is still there, it means onchange didn't fire (user likely cancelled)
                // We should clean up.
                // Note: this might run before onchange in some edge cases? 
                // Usually change fires before focus.
                // To be safe, we can check input.files.
                if (!input.files || input.files.length === 0) {
                     document.body.removeChild(input);
                     resolve(null);
                }
            }
            window.removeEventListener('focus', onFocus);
        }, 500);
    };
    
    window.addEventListener('focus', onFocus);

    document.body.appendChild(input);
    input.click();
  });
}
