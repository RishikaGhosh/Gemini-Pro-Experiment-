
import { GoogleGenAI, GenerateContentResponse, Chat, FunctionDeclaration, Type, Modality } from "@google/genai";

// ==============================================================================
// Gemini API Service
//
// This service encapsulates all interactions with the Google Gemini API.
// It assumes the API key is available via `process.env.API_KEY`.
// For video generation, it handles the specific API key selection flow.
// ==============================================================================

/**
 * A helper function to create a new GoogleGenAI instance.
 * For video generation, a new instance must be created right before the API call
 * to ensure the latest selected API key is used.
 * @returns {GoogleGenAI} A new instance of the GoogleGenAI client.
 */
const getClient = () => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        throw new Error("API_KEY environment variable not set.");
    }
    return new GoogleGenAI({ apiKey });
};


// --- Core Text Capabilities ---

/**
 * ## Simple Text Generation
 * Generates a text response from a single prompt.
 * @param {string} prompt - The text prompt to send to the model.
 * @returns {Promise<string>} The generated text response.
 */
export const generateText = async (prompt: string): Promise<string> => {
    const ai = getClient();
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });
    return response.text;
};

/**
 * ## Streaming Text Generation
 * Generates a text response in chunks for a real-time effect.
 * @param {string} prompt - The text prompt.
 * @param {(chunk: string) => void} onChunk - Callback function to handle each incoming chunk of text.
 * @returns {Promise<void>}
 */
export const generateTextStream = async (prompt: string, onChunk: (chunk: string) => void): Promise<void> => {
    const ai = getClient();
    const responseStream = await ai.models.generateContentStream({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });

    for await (const chunk of responseStream) {
        onChunk(chunk.text);
    }
};

// --- Chat Capabilities ---

/**
 * ## Start a Chat Session
 * Creates a new chat instance with conversation history.
 * @returns {Chat} A new chat session object.
 */
export const startChat = (): Chat => {
    const ai = getClient();
    return ai.chats.create({
        model: 'gemini-2.5-flash',
        // Optional: Add history or system instructions here
    });
};

/**
 * ## Continue a Chat Session
 * Sends a new message in an existing chat session and gets the response.
 * @param {Chat} chat - The chat instance.
 * @param {string} message - The user's message.
 * @returns {Promise<string>} The model's response.
 */
export const continueChat = async (chat: Chat, message: string): Promise<string> => {
    const response = await chat.sendMessage({ message });
    return response.text;
};

// --- Advanced Capabilities ---

/**
 * ## JSON Mode with Schema
 * Forces the model to return a JSON object matching a predefined schema.
 * @returns {Promise<string>} A JSON string of cookie recipes.
 */
export const getJsonRecipes = async (): Promise<string> => {
    const ai = getClient();
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: "List three popular cookie recipes, including ingredients and steps.",
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                description: "A list of cookie recipes.",
                items: {
                    type: Type.OBJECT,
                    properties: {
                        recipeName: { type: Type.STRING, description: 'Name of the cookie.' },
                        ingredients: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'List of ingredients.' },
                        steps: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Cooking instructions.' },
                    },
                    required: ["recipeName", "ingredients", "steps"],
                },
            },
        },
    });
    // The response.text is a string, which can be parsed as JSON
    return JSON.stringify(JSON.parse(response.text), null, 2);
};

/**
 * ## Function Calling
 * Demonstrates how the model can request to call external functions.
 * @param {string} prompt - A prompt that would trigger a function call.
 * @returns {Promise<string>} A description of the function call requested by the model.
 */
export const demonstrateFunctionCalling = async (prompt: string): Promise<string> => {
    const ai = getClient();
    const controlLightFunction: FunctionDeclaration = {
        name: 'controlLight',
        description: 'Set brightness and color of a light.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                brightness: { type: Type.NUMBER, description: 'Light level from 0 to 100.' },
                color: { type: Type.STRING, description: 'e.g., "warm white" or "blue".' },
            },
            required: ['brightness', 'color'],
        },
    };

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            tools: [{ functionDeclarations: [controlLightFunction] }],
        },
    });

    const functionCalls = response.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
        const call = functionCalls[0];
        // In a real app, you would execute this function. Here, we just describe it.
        return `Model requested to call function "${call.name}" with arguments: ${JSON.stringify(call.args)}.`;
    }
    return `Model did not request a function call. It responded: ${response.text}`;
};

// --- Grounding Capabilities ---

/**
 * ## Grounding with Google Search (RAG)
 * Answers a query using real-time information from Google Search.
 * @param {string} query - The question to ask.
 * @returns {Promise<{text: string, sources: any[]}>} The answer and source URLs.
 */
export const searchWithGoogle = async (query: string): Promise<{ text: string; sources: any[] }> => {
    const ai = getClient();
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: query,
        config: {
            tools: [{ googleSearch: {} }],
        },
    });

    const text = response.text;
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    return { text, sources };
};

/**
 * ## Grounding with Google Maps
 * Answers a location-based query using Google Maps data.
 * @param {string} query - The location-based question.
 * @param {{latitude: number, longitude: number}} location - The user's current location.
 * @returns {Promise<{text: string, sources: any[]}>} The answer and place URLs.
 */
export const searchWithMaps = async (query: string, location: { latitude: number, longitude: number }): Promise<{ text: string; sources: any[] }> => {
    const ai = getClient();
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: query,
        config: {
            tools: [{ googleMaps: {} }],
            toolConfig: { retrievalConfig: { latLng: location } }
        },
    });
    
    const text = response.text;
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    return { text, sources };
};

// --- Multimodal Capabilities ---

/**
 * ## Describe an Image
 * Generates a text description for a given image.
 * @param {string} prompt - The prompt to guide the description.
 * @param {string} imageBase64 - The base64-encoded image data.
 * @param {string} mimeType - The MIME type of the image.
 * @returns {Promise<string>} A text description of the image.
 */
export const describeImage = async (prompt: string, imageBase64: string, mimeType: string): Promise<string> => {
    const ai = getClient();
    const imagePart = { inlineData: { data: imageBase64, mimeType } };
    const textPart = { text: prompt };

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [imagePart, textPart] },
    });
    return response.text;
};


/**
 * ## Generate an Image
 * Creates an image based on a text prompt using Imagen.
 * @param {string} prompt - The description of the image to generate.
 * @returns {Promise<string>} The base64-encoded string of the generated image.
 */
export const generateImage = async (prompt: string): Promise<string> => {
    const ai = getClient();
    const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt,
        config: {
            numberOfImages: 1,
            outputMimeType: 'image/jpeg',
            aspectRatio: '1:1',
        },
    });

    if (response.generatedImages && response.generatedImages.length > 0) {
        return response.generatedImages[0].image.imageBytes;
    }
    throw new Error("Image generation failed.");
};

/**
 * ## Generate a Video
 * Creates a video based on a text prompt using Veo.
 * @param {string} prompt - The description of the video to generate.
 * @returns {Promise<string>} The URL to the generated video file.
 */
export const generateVideo = async (prompt: string): Promise<string> => {
    // Veo requires a specific API key selection flow
    if (window.aistudio && !(await window.aistudio.hasSelectedApiKey())) {
        await window.aistudio.openSelectKey();
    }

    const ai = getClient(); // Get client after key selection
    
    try {
        let operation = await ai.models.generateVideos({
            model: 'veo-3.1-fast-generate-preview',
            prompt,
            config: {
                numberOfVideos: 1,
                resolution: '720p',
                aspectRatio: '16:9'
            }
        });

        // Poll for completion
        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 10000));
            operation = await ai.operations.getVideosOperation({ operation });
        }

        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (downloadLink) {
             // Append API key for direct fetching
            return `${downloadLink}&key=${process.env.API_KEY}`;
        }
        throw new Error("Video generation completed but no download link found.");
    } catch (error: any) {
        if (error.message.includes("Requested entity was not found.")) {
             throw new Error("API key is invalid or not found. Please select a valid key.");
        }
        throw error;
    }
};
