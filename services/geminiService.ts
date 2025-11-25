/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { GoogleGenAI, Modality } from '@google/genai';
import { GenerationParams, STYLE_PRESETS } from '../types';

export const generateWallpaperImage = async (params: GenerationParams): Promise<{ imageBase64: string; mimeType: string; enhancedPrompt: string }> => {
  // Initialize the client inside the function to ensure it picks up the latest API_KEY 
  // if the user selects it via the AIStudio overlay during the session.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    let finalPrompt = params.prompt;
    const style = STYLE_PRESETS.find(s => s.id === params.stylePreset);
    const isStyleActive = style && style.id !== 'none';

    // Step 1: Enhance the prompt using Gemini Flash if requested
    if (params.enhancePrompt) {
      try {
        // We pass the style hints to the AI to weave them in naturally, rather than appending tags manually.
        const enhancementSystemPrompt = `You are an expert AI art director. 
        Rewrite the user's concept into a descriptive, high-quality image generation prompt for Gemini 3 Pro.
        
        User Concept: "${params.prompt}"
        Style Context: ${isStyleActive ? `${style.label} (${style.description})` : 'Neutral / Faithful to User Concept'}
        ${isStyleActive ? `Visual Elements to Integrate: ${style.promptSuffix}` : ''}
        
        Instructions:
        1. Describe the scene, lighting, and composition in detail.
        2. Integrate the style's visual elements naturally into the description (if a style is provided).
        3. Do not simply append a list of keywords.
        4. Output ONLY the final prompt text.`;

        const enhancementResponse = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [{ role: 'user', parts: [{ text: enhancementSystemPrompt }] }],
        });

        if (enhancementResponse.text) {
          finalPrompt = enhancementResponse.text.trim();
        }
      } catch (enhancementError) {
        console.warn('Prompt enhancement failed, proceeding with original prompt:', enhancementError);
        // Fallback to original prompt if enhancement fails
      }
    }
    // If enhancement is disabled, we now use the raw prompt exactly as typed.

    // Step 2: Generate Image with Gemini 3 Pro
    const modelId = 'gemini-3-pro-image-preview';

    const response = await ai.models.generateContent({
      model: modelId,
      contents: [
        {
          role: 'user',
          parts: [{ text: finalPrompt }],
        },
      ],
      config: {
        responseModalities: [Modality.IMAGE],
        imageConfig: {
          imageSize: params.resolution,
          aspectRatio: params.aspectRatio,
        },
      },
    });

    // Extract image from response
    const candidates = response.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error('No candidates returned from Gemini.');
    }

    const parts = candidates[0].content?.parts;
    if (!parts || parts.length === 0) {
      throw new Error('No content parts returned.');
    }

    // Find the inline data part
    const imagePart = parts.find((part) => part.inlineData);

    if (!imagePart || !imagePart.inlineData) {
      throw new Error('No image data found in response.');
    }

    return {
      imageBase64: imagePart.inlineData.data,
      mimeType: imagePart.inlineData.mimeType || 'image/png',
      enhancedPrompt: finalPrompt
    };

  } catch (error) {
    console.error('Gemini generation error:', error);
    throw error;
  }
};
