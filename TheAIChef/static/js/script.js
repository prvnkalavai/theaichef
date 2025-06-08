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
                lastAiMessageContainer.querySelectorAll('.recipe-text-part, .error-text, .fallback-text').forEach(span => {
                    textParts.push(span.textContent);
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
        const messageText = userInput.value.trim();
        const imagePreview = imagePreviewArea.querySelector('img');

        if (messageText === '' && !imagePreview) {
            // Optionally, provide feedback to the user if they try to send an empty message
            // appendMessageToArea("Please type a message or upload an image.", 'ai-message system-info', false);
            return;
        }

        appendMessageToArea(messageText || "[Image Uploaded]", 'user-message', true);
        userInput.value = '';
        userInput.focus();

        // Show a thinking indicator
        appendMessageToArea("The AI Chef is thinking...", 'ai-message system-info', false, true);


        fetch('/send_message', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message: messageText, image_present: !!imagePreview }),
        })
        .then(response => {
            // Remove thinking indicator once response starts processing
            removeThinkingIndicator();
            if (!response.ok) {
                return response.json().then(errData => {
                    throw new Error(errData.error || `Server error (${response.status})`);
                }).catch(() => {
                    throw new Error(`Server error (${response.status}) - Could not parse error details.`);
                });
            }
            return response.json();
        })
        .then(data => {
            if (data.error) { // Backend explicitly sent an error object
                appendMessageToArea(data.error, 'ai-message error-message', false);
            } else if (data.structured_recipe && Array.isArray(data.structured_recipe)) {
                if (data.structured_recipe.length === 0) {
                     appendMessageToArea("I couldn't come up with anything for that. Try asking something else!", 'ai-message fallback-text', false);
                } else {
                    const aiMessageContainer = document.createElement('div');
                    aiMessageContainer.classList.add('message', 'ai-message');

                    data.structured_recipe.forEach(part => {
                        if (part.type === 'text' && part.content) {
                            const textElement = document.createElement('div');
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
                appendMessageToArea("Received an unclear response from the AI. Please try again.", 'ai-message error-message', false);
            }
        })
        .catch(error => { // Catches network errors and errors thrown from .then()
            removeThinkingIndicator(); // Ensure thinking indicator is removed on error too
            console.error('Error sending/receiving message:', error);
            appendMessageToArea(error.message || 'A network error occurred, or the AI Chef is unavailable. Please try again.', 'ai-message error-message', false);
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
        const thinkingMessage = messageArea.querySelector('.system-info');
        if (thinkingMessage && thinkingMessage.textContent.includes("thinking...")) {
            thinkingMessage.remove();
        }
    }

    function appendMessageToArea(textOrHtml, className, isUserMessage, isSystemInfo = false) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', className);
        if (isSystemInfo) { // For "Thinking..." or other system messages
            messageDiv.classList.add('system-info');
        }

        const contentSpan = document.createElement('span');
        if (isUserMessage) {
            contentSpan.textContent = textOrHtml;
        } else {
            contentSpan.innerHTML = String(textOrHtml).replace(/\n/g, '<br>');
            if(className.includes('error-message')){
                contentSpan.classList.add('error-text');
            } else if (className.includes('fallback-text') || className.includes('system-info')) {
                contentSpan.classList.add(className.split(' ')[1]); // e.g., 'fallback-text' or 'system-info'
            }
        }
        messageDiv.appendChild(contentSpan);

        messageArea.appendChild(messageDiv);
        messageArea.scrollTop = messageArea.scrollHeight;
    }
});
