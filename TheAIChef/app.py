import os
from flask import Flask, render_template, request, jsonify, current_app # Added current_app for logger
import google.generativeai as genai
from google.generativeai import types as genai_types
from google.api_core import exceptions as google_exceptions # For specific Google API errors

app = Flask(__name__)

# Configure Gemini API key
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
gemini_api_configured = False

if not GEMINI_API_KEY:
    app.logger.warning("GEMINI_API_KEY environment variable not set. AI features will be limited or unavailable.")
else:
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        app.logger.info("Successfully configured Gemini API key.")
        gemini_api_configured = True
    except Exception as e:
        app.logger.error(f"Error configuring Gemini API: {e}")

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/send_message', methods=['POST'])
def send_message_route():
    data = request.get_json()
    if not data or 'message' not in data:
        return jsonify({'error': 'No message provided in the request.'}), 400

    user_message = data.get('message').strip()

    if not gemini_api_configured:
        app.logger.warning("Attempted to send message but Gemini API is not configured.")
        return jsonify({'error': "AI Chef (offline): The AI is currently unavailable due to a configuration issue. Please try again later."}), 503

    if not user_message:
        return jsonify({'error': "Please type a message to The AI Chef."}), 400

    try:
        model = genai.GenerativeModel('gemini-1.5-flash-latest')

        prompt = (
            f"You are The AI Chef, an expert in creating clear and easy-to-follow recipes. "
            f"A user is asking for a recipe based on their input: '{user_message}'.\n\n"
            "Please generate a detailed recipe that includes the following sections:\n"
            "1.  **Recipe Title:** A creative and appealing title for the dish.\n"
            "2.  **Description:** A short, engaging paragraph describing the dish (2-3 sentences).\n"
            "3.  **Approximate Servings:** How many people the recipe serves.\n"
            "4.  **Preparation & Cooking Time:** Combined total, or separate if significantly different (e.g., 'Prep: 20 mins, Cook: 40 mins').\n"
            "5.  **Ingredients:** A bulleted list with exact quantities (e.g., '1 cup flour', '200g chicken breast').\n"
            "6.  **Instructions:** A numbered list of step-by-step preparation and cooking instructions. These should be clear, concise, and easy for a beginner cook to follow.\n"
            "7.  **Visuals (Optional but Encouraged):** For 2-3 key instruction steps (e.g., a complex technique, or the finished dish presentation), if you can generate a relevant image, please do so. Images should be clear, well-lit, and directly visualize the food or preparation step described. Do not generate images for simple steps like 'preheat the oven' or for non-visual elements.\n\n"
            "**Important Guidelines:**\n"
            "-   If the user's input is too vague (e.g., 'something tasty'), not food-related, or unclear, politely ask for clarification. For example: 'I'm best at generating recipes. Could you tell me more about the dish you'd like to make, or perhaps list some ingredients you have on hand?' Do not attempt to generate a recipe or image for such inputs.\n"
            "-   If the input is a simple greeting (e.g., 'hello', 'how are you?'), respond warmly and conversationally, and ask how you can assist with their cooking needs today. Do not generate a recipe or image for greetings.\n"
            "-   Ensure all text is helpful, friendly, and encouraging for a home cook.\n"
        )

        response = model.generate_content(prompt)

        processed_parts = []
        has_content = False

        if response and response.parts:
            for part in response.parts:
                if hasattr(part, 'text') and part.text:
                    processed_parts.append({'type': 'text', 'content': part.text.strip()})
                    has_content = True
                elif hasattr(part, 'inline_data') and part.inline_data and part.inline_data.data:
                    image_data_uri = f"data:{part.inline_data.mime_type};base64,{part.inline_data.data}"
                    processed_parts.append({'type': 'image', 'content': image_data_uri, 'mime_type': part.inline_data.mime_type})
                    has_content = True # Image also counts as content
        elif response and hasattr(response, 'text') and response.text: # Fallback for simple text-only response
             processed_parts.append({'type': 'text', 'content': response.text.strip()})
             has_content = True

        if not has_content:
            app.logger.warning(f"Gemini API returned no processable content for prompt: {prompt[:200]}...") # Log snippet of prompt
            # Check for safety ratings or finish reasons if available in response
            finish_reason = getattr(response.candidates[0], 'finish_reason', 'Unknown') if response.candidates else 'Unknown'
            if finish_reason != "STOP": # Assuming "STOP" is normal. Other reasons might be "SAFETY", "RECITATION", etc.
                 app.logger.warning(f"Gemini generation finished with reason: {finish_reason}. Full response: {response}")
                 processed_parts.append({'type': 'text', 'content': "I'm sorry, I couldn't generate a complete response for that. This might be due to content restrictions or an issue with the request. Please try rephrasing or be more specific."})
            else: # Normal finish but no parts
                 processed_parts.append({'type': 'text', 'content': "I'm sorry, I wasn't able to come up with specific details for that request. Could you try being more specific?"})


        ai_reply_payload = {'structured_recipe': processed_parts}
        return jsonify(ai_reply_payload)

    except google_exceptions.InvalidArgument as e:
        app.logger.error(f"Gemini API InvalidArgument error: {e}. Prompt: {prompt[:200]}...")
        return jsonify({'error': "There was an issue with the request to the AI (Invalid Argument). Please try rephrasing your message."}), 400
    except google_exceptions.DeadlineExceeded as e:
        app.logger.error(f"Gemini API DeadlineExceeded error: {e}. Prompt: {prompt[:200]}...")
        return jsonify({'error': "The AI is taking too long to respond. Please try again in a few moments."}), 504
    except google_exceptions.GoogleAPIError as e: # Catch other Google API specific errors
        app.logger.error(f"Gemini API GoogleAPIError: {e}. Prompt: {prompt[:200]}...")
        error_message = "An unexpected error occurred with the AI service. Please try again later."
        if "API_KEY_INVALID" in str(e) or "API key not valid" in str(e):
             error_message = "AI Chef (error): The AI service API key is invalid. Please contact support."
        elif "billing account" in str(e).lower():
            error_message = "AI Chef (error): There's an issue with the project's billing configuration. Please contact support."
        elif "model" in str(e).lower() and "not found" in str(e).lower():
            error_message = "AI Chef (error): The specified AI model was not found. Please contact support."
        elif "quota" in str(e).lower():
            error_message = "AI Chef (error): The AI service quota has been exceeded. Please try again later."
        return jsonify({'error': error_message}), 500
    except Exception as e:
        app.logger.error(f"Generic error calling Gemini API: {e}. Prompt: {prompt[:200]}...")
        return jsonify({'error': "Sorry, an unexpected error occurred while trying to generate your recipe. The team has been notified."}), 500

if __name__ == '__main__':
    # Set up basic logging for app
    if not app.debug: # Only use basicConfig if not in debug mode (Flask's reloader can cause issues)
        import logging
        logging.basicConfig(level=logging.INFO)
    app.run(debug=True, host='0.0.0.0', port=5000)
