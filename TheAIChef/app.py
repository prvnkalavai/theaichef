import os
from flask import Flask, render_template, request, jsonify, current_app # Added current_app for logger
import google.generativeai as genai
from google.generativeai import types as genai_types
from google.api_core import exceptions as google_exceptions # For specific Google API errors
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

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
    app.logger.info(f"--- send_message_route triggered ---")
    app.logger.debug(f"Request headers: {request.headers}")
    try:
        request_json_data = request.get_json()
        app.logger.info(f"Request JSON data: {request_json_data}")
    except Exception as e_req_log:
        app.logger.warning(f"Could not log request JSON data: {e_req_log}. Raw data (first 100 chars): {request.data[:100]}...")


    if not request_json_data or 'message' not in request_json_data:
        app.logger.warning("Request JSON data missing or 'message' key absent.")
        return jsonify({'error': 'No message provided in the request.'}), 400

    user_message = request_json_data.get('message').strip()
    app.logger.info(f"User message received: '{user_message}'")


    if not gemini_api_configured:
        app.logger.warning("Attempted to send message but Gemini API is not configured.")
        return jsonify({'error': "AI Chef (offline): The AI is currently unavailable due to a configuration issue. Please try again later."}), 503

    if not user_message:
        app.logger.info("User message is empty after stripping.")
        return jsonify({'error': "Please type a message to The AI Chef."}), 400

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
    app.logger.info(f"Constructed prompt for Gemini (first 300 chars): {prompt[:300]}...")
    app.logger.debug(f"Full prompt for Gemini: {prompt}")

    response = None
    try:
        model = genai.GenerativeModel('gemini-2.0-flash-preview-image-generation')
        response = model.generate_content(prompt) # Assign to response variable
        generation_config_with_images = genai_types.GenerationConfig(
            response_modalities=['TEXT', 'IMAGE']
        )
        app.logger.info(f"Using generation_config with response_modalities: {generation_config_with_images.response_modalities}")

        response = model.generate_content(
            prompt,
            generation_config=generation_config_with_images
        )

        app.logger.info("Received response object from Gemini.")
        try: # Detailed logging of raw response parts
            if response:
                app.logger.info(f"Gemini response finish_reason: {response.candidates[0].finish_reason if response.candidates and response.candidates[0] else 'N/A'}")
                app.logger.info(f"Gemini response safety_ratings: {response.candidates[0].safety_ratings if response.candidates and response.candidates[0] else 'N/A'}")
                app.logger.info(f"Number of raw response parts: {len(response.parts) if response.parts else 0}")
                if response.parts:
                    for i, part in enumerate(response.parts):
                        if hasattr(part, 'text') and part.text:
                            app.logger.info(f"Raw Part {i} (text): {part.text[:100].strip()}...")
                        elif hasattr(part, 'inline_data') and part.inline_data:
                            app.logger.info(f"Raw Part {i} (image): mime_type={part.inline_data.mime_type}, size={len(part.inline_data.data)} bytes")
            else:
                app.logger.warning("Gemini response object is None or empty after API call.")
        except Exception as e_log_resp:
            app.logger.error(f"Error logging raw Gemini response details: {e_log_resp}")

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
                    has_content = True
            # New summary logging for response.parts content
            num_image_parts_api = sum(1 for p in response.parts if hasattr(p, 'inline_data') and p.inline_data)
            num_text_parts_api = sum(1 for p in response.parts if hasattr(p, 'text') and p.text)
            app.logger.info(f"Summary of Gemini API response parts: Total={len(response.parts)}, Text={num_text_parts_api}, Image={num_image_parts_api}.")

        elif response and hasattr(response, 'text') and response.text: # Fallback for simple text-only response
             processed_parts.append({'type': 'text', 'content': response.text.strip()})
             has_content = True
             app.logger.info("Gemini API response was a single text block (no .parts structure).")

        if not has_content:
            app.logger.warning(f"Gemini API returned no processable content. Prompt (first 200 chars): {prompt[:200]}...")
            finish_reason_str = 'Unknown'
            if response and response.candidates and response.candidates[0]:
                finish_reason_str = str(response.candidates[0].finish_reason)

            app.logger.warning(f"Gemini generation finish_reason: {finish_reason_str}.")
            # More detailed logging of the full response if it's small enough or in debug
            if app.debug or (response and len(str(response)) < 1000): # Avoid overly long logs
                 app.logger.debug(f"Full Gemini response object on no_has_content: {response}")

            if "SAFETY" in finish_reason_str.upper():
                 processed_parts.append({'type': 'text', 'content': "I'm sorry, I couldn't generate a response that meets safety guidelines for your request. Please try rephrasing."})
            else:
                 processed_parts.append({'type': 'text', 'content': "I'm sorry, I wasn't able to come up with specific details for that request. Could you try being more specific?"})

        app.logger.info(f"Processed {len(processed_parts)} parts to be sent to frontend.")
        ai_reply_payload = {'structured_recipe': processed_parts}
        return jsonify(ai_reply_payload)

    except google_exceptions.InvalidArgument as e:
        app.logger.error(f"Gemini API InvalidArgument error ({type(e).__name__}): {e}. Prompt (first 200 chars): {prompt[:200]}...")
        return jsonify({'error': "There was an issue with the request to the AI (Invalid Argument). Please try rephrasing your message."}), 400
    except google_exceptions.DeadlineExceeded as e:
        app.logger.error(f"Gemini API DeadlineExceeded error ({type(e).__name__}): {e}. Prompt (first 200 chars): {prompt[:200]}...")
        return jsonify({'error': "The AI is taking too long to respond. Please try again in a few moments."}), 504
    except google_exceptions.GoogleAPIError as e:
        app.logger.error(f"Gemini API GoogleAPIError ({type(e).__name__}): {e}. Prompt (first 200 chars): {prompt[:200]}...")
        error_message = "An unexpected error occurred with the AI service. Please try again later."
        str_error = str(e).lower()
        if "api_key_invalid" in str_error or "api key not valid" in str_error:
             error_message = "AI Chef (error): The AI service API key is invalid. Please contact support."
        elif "billing account" in str_error:
            error_message = "AI Chef (error): There's an issue with the project's billing configuration. Please contact support."
        elif "model" in str_error and "not found" in str_error:
            error_message = "AI Chef (error): The specified AI model was not found. Please contact support."
        elif "quota" in str_error:
            error_message = "AI Chef (error): The AI service quota has been exceeded. Please try again later."
        elif "resource_exhausted" in str_error:
            error_message = "AI Chef (error): The AI service is currently overloaded or quota has been hit. Please try again later."
        return jsonify({'error': error_message}), 500
    except Exception as e:
        app.logger.error(f"Generic error calling Gemini API ({type(e).__name__}): {e}. Prompt (first 200 chars): {prompt[:200]}...")
        return jsonify({'error': "Sorry, an unexpected error occurred while trying to generate your recipe. The development team has been notified."}), 500

if __name__ == '__main__':
    if not app.debug:
        import logging
        logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
    else:
        app.logger.setLevel(logging.DEBUG)

    app.run(debug=True, host='0.0.0.0', port=5000)
