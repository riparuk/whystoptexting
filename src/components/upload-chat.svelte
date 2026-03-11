<script lang="ts">
    import JSZip from "jszip";
    import { parseWhatsAppChat } from "../lib/parser";
    import { setChatData } from "../lib/store";

    let isDragging = $state(false);
    let isLoading = $state(false);
    let error = $state<string | null>(null);
    let fileName = $state<string | null>(null);

    async function processFile(file: File) {
        isLoading = true;
        error = null;
        fileName = null;

        try {
            let chatText = "";

            if (file.name.endsWith(".zip")) {
                const zip = await JSZip.loadAsync(file);
                const chatFile = zip.file(/\.txt$/i)[0];
                if (!chatFile) {
                    throw new Error(
                        "ZIP file does not contain a .txt file. Please ensure this is a WhatsApp backup export.",
                    );
                }
                chatText = await chatFile.async("string");
                fileName = file.name;
            } else if (file.name.endsWith(".txt")) {
                chatText = await file.text();
                fileName = file.name;
            } else {
                throw new Error(
                    "Unsupported file format. Please upload a .zip or .txt file from a WhatsApp export.",
                );
            }

            if (!chatText.trim()) {
                throw new Error("File is empty or unreadable.");
            }

            // Quick validation: check if it looks like a WhatsApp export
            if (
                !chatText.match(
                    /(?:\[\d{1,2}\/\d{1,2}\/\d{2,4},\s\d{1,2}\.\d{2}\.\d{2}\])|(?:\d{1,2}\/\d{1,2}\/\d{2,4},\s\d{1,2}:\d{2})/,
                )
            ) {
                throw new Error(
                    "Invalid file format. Please ensure this is a WhatsApp chat backup.",
                );
            }

            const parsed = parseWhatsAppChat(chatText);

            if (parsed.messages.length === 0) {
                throw new Error("No messages could be parsed from this file.");
            }

            const base = import.meta.env.BASE_URL;

            await setChatData(parsed);
            window.location.href = base + "/" + "analytics";
        } catch (e: any) {
            error = e.message || "An error occurred while processing the file.";
        } finally {
            isLoading = false;
        }
    }

    function handleDrop(e: DragEvent) {
        e.preventDefault();
        isDragging = false;
        const file = e.dataTransfer?.files[0];
        if (file) processFile(file);
    }

    function handleDragOver(e: DragEvent) {
        e.preventDefault();
        isDragging = true;
    }

    function handleDragLeave() {
        isDragging = false;
    }

    function handleInputChange(e: Event) {
        const input = e.target as HTMLInputElement;
        const file = input.files?.[0];
        if (file) processFile(file);
        // Reset input so same file can be re-selected
        input.value = "";
    }

    function openFilePicker() {
        document.getElementById("file-input")?.click();
    }
</script>

<div class="upload-wrapper">
    <!-- Header -->
    <div class="upload-header animate-fade-up">
        <div class="logo-icon">💬</div>
        <h1 class="title gradient-text">WhyStopTexting</h1>
        <p class="subtitle">
            Analyze your WhatsApp chat backup with cool visualizations
        </p>
    </div>

    <!-- Drop Zone -->
    <div
        class="drop-zone glass-card animate-fade-up"
        class:dragging={isDragging}
        class:loading-state={isLoading}
        role="button"
        tabindex="0"
        ondrop={handleDrop}
        ondragover={handleDragOver}
        ondragleave={handleDragLeave}
        onclick={openFilePicker}
        onkeydown={(e) => e.key === "Enter" && openFilePicker()}
        style="animation-delay: 0.1s"
        aria-label="Upload file chat WhatsApp"
    >
        {#if isLoading}
            <div class="loading-content">
                <div class="spinner"></div>
                <p class="loading-text">
                    Processing file{fileName ? ` "${fileName}"` : ""}...
                </p>
            </div>
        {:else}
            <div class="drop-content">
                <div class="upload-icon" class:bounce={isDragging}>
                    {isDragging ? "📂" : "📁"}
                </div>
                <h2 class="drop-title">
                    {isDragging
                        ? "Drop file here!"
                        : "Upload WhatsApp Chat Backup"}
                </h2>
                <p class="drop-description">
                    Drag & drop a .zip or .txt file here,<br />
                    or <span class="click-link">click to choose a file</span>
                </p>
                <div class="format-badges">
                    <span class="badge">.zip</span>
                    <span class="badge">.txt</span>
                </div>
                <p class="privacy-note">
                    🔒 All data is processed locally in your browser. Nothing is
                    sent to the server.
                </p>
            </div>
        {/if}
    </div>

    <!-- Error -->
    {#if error}
        <div class="error-box animate-fade-up">
            <span class="error-icon">⚠️</span>
            <p class="error-text">{error}</p>
        </div>
    {/if}

    <!-- How to export instructions -->
    <div
        class="instructions glass-card animate-fade-up"
        style="animation-delay: 0.2s"
    >
        <h3 class="instructions-title">How to Export WhatsApp Chat</h3>
        <p>
            Follow the <a
                href="https://faq.whatsapp.com/1180414079177245/?helpref=uf_share"
                target="_blank"
                rel="noopener noreferrer"
                class="click-link">official WhatsApp guide</a
            > to export your chat history.
        </p>
        <p>
            ⚠️ <strong>Important:</strong> You must select
            <strong>"Without media"</strong> during the export process.
        </p>
    </div>

    <!-- Footer Credit -->
    <div class="footer-credit animate-fade-up" style="animation-delay: 0.3s">
        Open source by
        <a
            href="https://github.com/riparuk/whystoptexting"
            target="_blank"
            rel="noopener noreferrer"
            class="credit-link"
        >
            <svg
                height="16"
                width="16"
                viewBox="0 0 16 16"
                aria-hidden="true"
                fill="currentColor"
                class="github-icon"
            >
                <path
                    fill-rule="evenodd"
                    d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
                ></path>
            </svg>
            riparuk
        </a>
    </div>
</div>

<input
    id="file-input"
    type="file"
    accept=".zip,.txt"
    onchange={handleInputChange}
    style="display: none"
/>

<style>
    .upload-wrapper {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        padding: 32px 16px;
        gap: 24px;
        max-width: 560px;
        margin: 0 auto;
    }

    .upload-header {
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
    }

    .logo-icon {
        font-size: 48px;
        line-height: 1;
        filter: drop-shadow(0 0 20px rgba(236, 72, 153, 0.5));
    }

    .title {
        font-size: 2.5rem;
        font-weight: 800;
        margin: 0;
        letter-spacing: -0.02em;
    }

    .subtitle {
        color: var(--text-secondary);
        font-size: 1rem;
        margin: 0;
        line-height: 1.5;
    }

    .drop-zone {
        width: 100%;
        padding: 48px 32px;
        cursor: pointer;
        text-align: center;
        border: 2px dashed var(--border-subtle);
        transition: all 0.25s ease;
        outline: none;
        user-select: none;
    }

    .drop-zone:hover,
    .drop-zone:focus-visible {
        border-color: var(--pink-500);
        box-shadow: 0 0 32px rgba(236, 72, 153, 0.2);
        transform: translateY(-2px);
    }

    .drop-zone.dragging {
        border-color: var(--pink-400);
        background: rgba(236, 72, 153, 0.08);
        box-shadow: 0 0 48px rgba(236, 72, 153, 0.3);
        transform: scale(1.02);
    }

    .drop-zone.loading-state {
        cursor: not-allowed;
        pointer-events: none;
    }

    .drop-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
    }

    .upload-icon {
        font-size: 56px;
        line-height: 1;
        transition: transform 0.3s ease;
    }

    .upload-icon.bounce {
        animation: bounceIcon 0.5s ease infinite alternate;
    }

    @keyframes bounceIcon {
        from {
            transform: scale(1);
        }
        to {
            transform: scale(1.15);
        }
    }

    .drop-title {
        font-size: 1.3rem;
        font-weight: 700;
        margin: 0;
        color: var(--text-primary);
    }

    .drop-description {
        color: var(--text-secondary);
        font-size: 0.9rem;
        margin: 0;
        line-height: 1.6;
    }

    .click-link {
        color: var(--pink-400);
        font-weight: 600;
        text-decoration: underline;
        text-decoration-color: transparent;
        transition: text-decoration-color 0.2s;
    }

    .click-link:hover {
        text-decoration-color: var(--pink-400);
    }

    .format-badges {
        display: flex;
        gap: 8px;
        margin-top: 4px;
    }

    .privacy-note {
        color: var(--text-muted);
        font-size: 0.78rem;
        margin: 4px 0 0;
    }

    /* Loading */
    .loading-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
        padding: 16px 0;
    }

    .spinner {
        width: 40px;
        height: 40px;
        border: 3px solid rgba(236, 72, 153, 0.2);
        border-top-color: var(--pink-500);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    .loading-text {
        color: var(--text-secondary);
        font-size: 0.95rem;
        margin: 0;
    }

    /* Error */
    .error-box {
        width: 100%;
        display: flex;
        align-items: flex-start;
        gap: 12px;
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.3);
        border-radius: 12px;
        padding: 16px;
    }

    .error-icon {
        font-size: 18px;
        flex-shrink: 0;
        margin-top: 1px;
    }

    .error-text {
        color: #fca5a5;
        font-size: 0.9rem;
        margin: 0;
        line-height: 1.5;
    }

    /* Instructions */
    .instructions {
        width: 100%;
        padding: 24px 28px;
    }

    .instructions-title {
        font-size: 0.95rem;
        font-weight: 700;
        color: var(--text-secondary);
        margin: 0 0 12px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    /* Footer Credit */
    .footer-credit {
        margin-top: 8px;
        font-size: 0.85rem;
        color: var(--text-muted);
        text-align: center;
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 6px;
    }

    .credit-link {
        color: var(--pink-400);
        font-weight: 600;
        text-decoration: none;
        transition:
            color 0.2s ease,
            text-shadow 0.2s ease;
        display: inline-flex;
        align-items: center;
        gap: 6px;
    }

    .credit-link:hover {
        color: var(--pink-300);
        text-shadow: 0 0 8px rgba(236, 72, 153, 0.4);
    }

    .github-icon {
        color: currentColor;
    }
</style>
