document.addEventListener('DOMContentLoaded', () => {
    const messageArea = document.getElementById('message-area');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const ttsButton = document.getElementById('tts-button');

    const imageUploadIcon = document.getElementById('image-upload-icon');
    const imageUploadInput = document.getElementById('image-upload-input');
    const imagePreviewArea = document.getElementById('image-preview-area');

    sendButton.addEventListener('click', handleSendMessage);
    userInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });

    if (ttsButton) {
        ttsButton.addEventListener('click', () => {
            const lastAiMessageContainer = messageArea.querySelector('.ai-message:last-child');
            let messageToSpeak = "No AI message found to read.";

            if (lastAiMessageContainer) {
                const textParts = [];
                lastAiMessageContainer.querySelectorAll('.recipe-text-part, .error-text, .fallback-text, .system-info').forEach(spanOrDiv => {
                    textParts.push(spanOrDiv.textContent);
                });
                if (textParts.length > 0) {
                    messageToSpeak = textParts.join("\n");
                }
            }

            console.log(`TTS playback triggered. Message: "${messageToSpeak}". Actual implementation pending.`);
            alert(`Imagine this is being narrated: "${messageToSpeak}"`);
        });
    }

    if (imageUploadIcon && imageUploadInput && imagePreviewArea) {
        imageUploadIcon.addEventListener('click', (e) => {
            e.preventDefault();
            imageUploadInput.click();
        });

        imageUploadInput.addEventListener('change', function(event) {
            const file = event.target.files[0];
            imagePreviewArea.innerHTML = '';

            if (file && file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    const img = document.createElement('img');
                    img.src = e.target.result;
                    imagePreviewArea.appendChild(img);

                    const removeButton = document.createElement('button');
                    removeButton.textContent = '✖';
                    removeButton.classList.add('remove-preview-button');
                    removeButton.title = 'Remove image';
                    removeButton.onclick = function() {
                        imagePreviewArea.innerHTML = '';
                        imageUploadInput.value = '';
                    };
                    imagePreviewArea.appendChild(removeButton);
                    console.log('Image selected:', file.name, '. Backend processing pending.');
                }
                reader.readAsDataURL(file);
            } else {
                if (file) {
                     console.log('Selected file is not an image:', file.name);
                     alert('Please select an image file (e.g., JPG, PNG).');
                }
                imageUploadInput.value = '';
            }
        });
    }

    function handleSendMessage() {
        console.log("handleSendMessage called.");
        const messageText = userInput.value.trim();
        const imagePreview = imagePreviewArea.querySelector('img');
        console.log("User input text:", messageText);
        console.log("Image preview present:", !!imagePreview);

        if (messageText === '' && !imagePreview) {
            console.log("Empty message and no image, not sending.");
            return;
        }

        appendMessageToArea(messageText || "[Image Uploaded]", 'user-message', true);
        userInput.value = '';
        userInput.focus();

        // Pass 'ai-message system-info' as className, isUserMessage as false, isSystemInfo as true
        appendMessageToArea("The AI Chef is thinking...", 'ai-message system-info', false, true);


        const payload = { message: messageText, image_present: !!imagePreview };
        console.log("Sending payload to /send_message:", JSON.stringify(payload));

        fetch('/send_message', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        })
        .then(response => {
            console.log("Raw fetch response received:", response);
            removeThinkingIndicator();
            if (!response.ok) {
                return response.json().then(errData => {
                    console.error("Parsed error data from !response.ok:", errData);
                    throw new Error(errData.error || `Server error (${response.status})`);
                }).catch(jsonParseError => {
                    console.error("Error parsing !response.ok JSON or not a JSON error:", jsonParseError);
                    throw new Error(`Server error (${response.status}) - Could not parse error details. Status text: ${response.statusText}`);
                });
            }
            return response.json();
        })
        .then(data => {
            console.log("Parsed JSON data from backend:", data);

            if (data.error) {
                console.error("Backend reported an error:", data.error);
                appendMessageToArea(data.error, 'ai-message error-message', false);
            } else if (data.structured_recipe && Array.isArray(data.structured_recipe)) {
                if (data.structured_recipe.length === 0) {
                     console.warn("Received empty structured_recipe array.");
                     // Pass 'ai-message fallback-text' as className
                     appendMessageToArea("I couldn't come up with anything for that. Try asking something else!", 'ai-message fallback-text', false);
                } else {
                    const aiMessageContainer = document.createElement('div');
                    // Apply base 'message' and specific 'ai-message' classes to the container
                    aiMessageContainer.classList.add('message', 'ai-message');
                    console.log("Processing structured recipe parts:", data.structured_recipe.length);
                    data.structured_recipe.forEach((part, index) => {
                        console.log(`Processing part ${index}:`, part);
                        if (part.type === 'text' && part.content) {
                            const textElement = document.createElement('div'); // Using div for recipe text parts
                            textElement.innerHTML = part.content.replace(/\n/g, '<br>');
                            textElement.classList.add('recipe-text-part');
                            aiMessageContainer.appendChild(textElement);
                        } else if (part.type === 'image' && part.content) {
                            const imageElement = document.createElement('img');
                            imageElement.src = part.content;
                            imageElement.alt = "Recipe step image";
                            imageElement.classList.add('recipe-image-part');
                            aiMessageContainer.appendChild(imageElement);
                        }
                    });
                    messageArea.appendChild(aiMessageContainer);
                }
            } else {
                console.warn("Received unclear or unexpected response structure from AI:", data);
                appendMessageToArea("Received an unclear response from the AI. Please try again.", 'ai-message error-message', false);
            }
        })
        .catch(error => {
            removeThinkingIndicator();
            console.error('Fetch caught an error. Full error object:', error);

            let displayErrorMessage = 'An error occurred. Please try again.';
            if (error && error.message) {
                displayErrorMessage = error.message;
                console.log('Using error.message for display:', displayErrorMessage);
            } else {
                console.warn('Error object did not have a .message property or it was empty. Using default error message.');
            }

            appendMessageToArea(displayErrorMessage, 'ai-message error-message', false);
        })
        .finally(() => {
            if (imagePreview) {
                imagePreviewArea.innerHTML = '';
                imageUploadInput.value = '';
            }
            messageArea.scrollTop = messageArea.scrollHeight;
        });
    }

    function removeThinkingIndicator() {
        console.log("Attempting to remove thinking indicator.");
        const thinkingMessages = messageArea.querySelectorAll('.message.system-info'); // Get all system messages
        thinkingMessages.forEach(msg => {
            if (msg.textContent.includes("thinking...")) {
                msg.remove();
                console.log("Thinking indicator removed.");
            }
        });
    }

    // isSystemInfo flag is still useful to differentiate styling for the contentSpan if needed
    function appendMessageToArea(textOrHtml, className, isUserMessage, isSystemInfo = false) {
        const messageDiv = document.createElement('div');

        // 1. Add base 'message' class
        messageDiv.classList.add('message');
        // 2. Add classes from className parameter (e.g., 'user-message', 'ai-message', 'error-message')
        if (className && typeof className === 'string') {
            className.trim().split(/\s+/).forEach(cls => {
                if (cls) { // Ensure non-empty string after split
                    messageDiv.classList.add(cls);
                }
            });
        }
        // The isSystemInfo flag was previously used to add 'system-info' to messageDiv,
        // but this is now handled if 'system-info' is part of the className string.
        // However, isSystemInfo is still passed and can be used for contentSpan or other logic.

        const contentSpan = document.createElement('span');
        if (isUserMessage) {
            contentSpan.textContent = textOrHtml;
        } else {
            // For AI messages, errors, fallbacks, system info
            contentSpan.innerHTML = String(textOrHtml).replace(/\n/g, '<br>');
            // 3. Modify contentSpan class handling
            if (className && className.includes('error-message')) {
                contentSpan.classList.add('error-text');
            } else if (className && className.includes('fallback-text')) {
                contentSpan.classList.add('fallback-text');
            } else if (className && className.includes('system-info')) { // Explicitly check for 'system-info' in className
                contentSpan.classList.add('system-info');
            }
        }
        messageDiv.appendChild(contentSpan);

        messageArea.appendChild(messageDiv);
        messageArea.scrollTop = messageArea.scrollHeight;
    }
});
