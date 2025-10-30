<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Capabilities 
<img width="1944" height="1002" alt="image" src="https://github.com/user-attachments/assets/ac02e5a2-5e50-448d-a5a6-6ccdedc6249d" />

## Example:

1. Image Generation

```
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

```

<img width="500" height="500" alt="image" src="https://github.com/user-attachments/assets/a7a55690-971b-4382-8198-5d8969ab5415" />

## Ending Notes

All the various capabilities of gemini are implemented in geminiService.ts. Please note that this is a fast moving space and this repository might not be upto date with regards to the latest capabilities. 



