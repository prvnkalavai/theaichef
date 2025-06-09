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
                     appendMessageToArea("I couldn't come up with anything for that. Try asking something else!", 'ai-message fallback-text', false);
                } else {
                    const aiMessageContainer = document.createElement('div');
                    aiMessageContainer.classList.add('message', 'ai-message');
                    console.log("Processing structured recipe parts:", data.structured_recipe.length);
                    data.structured_recipe.forEach((part, index) => {
                        console.log(`Processing part ${index}:`, part);
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
                console.warn("Received unclear or unexpected response structure from AI:", data);
                appendMessageToArea("Received an unclear response from the AI. Please try again.", 'ai-message error-message', false);
            }
        })
        .catch(error => {
            removeThinkingIndicator();
            console.error('Fetch caught an error. Full error object:', error);

            let displayErrorMessage = 'An error occurred. Please try again.'; // Default message
            if (error && error.message) {
                displayErrorMessage = error.message;
                console.log('Using error.message for display:', displayErrorMessage); // Changed to console.log for clarity
            } else {
                console.warn('Error object did not have a .message property or it was empty. Using default error message.'); // Changed to console.warn
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
        const thinkingMessage = messageArea.querySelector('.system-info');
        if (thinkingMessage && thinkingMessage.textContent.includes("thinking...")) {
            thinkingMessage.remove();
            console.log("Thinking indicator removed.");
        } else {
            console.log("Thinking indicator not found or already removed.");
        }
    }

    function appendMessageToArea(textOrHtml, className, isUserMessage, isSystemInfo = false) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', className);
        if (isSystemInfo) {
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
                contentSpan.classList.add(className.split(' ')[1]);
            }
        }
        messageDiv.appendChild(contentSpan);

        messageArea.appendChild(messageDiv);
        messageArea.scrollTop = messageArea.scrollHeight;
    }
});
