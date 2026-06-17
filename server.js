// server.js
import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// API keys from .env
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const AGENT_ID = process.env.AGENT_ID;
const IMGBB_API_KEY = process.env.IMGBB_API_KEY;

// Validate required env variables
if (!AGENT_ID) {
  console.error('Error: AGENT_ID is not set in .env file');
  process.exit(1);
}
if (!IMGBB_API_KEY) {
  console.error('Error: IMGBB_API_KEY is not set in .env file');
  process.exit(1);
}

/**
 * POST /api/generate-image
 * Generates an image using the pre-configured Mistral agent, uploads to ImgBB, and returns image_url
 */
app.post('/api/generate-image', async (req, res) => {
  try {
    const {
      input_prompt,
      temperature = 0.3,
      top_p = 0.95,
    } = req.body;

    // Validate required fields
    if (!input_prompt) {
      return res.status(400).json({
        error: 'Missing required field: input_prompt',
      });
    }

    // Step 1: Start conversation with the pre-configured agent and generate image [web:11][web:54]
    const conversationResponse = await fetch('https://api.mistral.ai/v1/conversations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MISTRAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        agent_id: AGENT_ID,
        inputs: input_prompt,
        temperature,
        top_p,
      }),
    });

    if (!conversationResponse.ok) {
      const error = await conversationResponse.json();
      throw new Error(error.message || 'Failed to start conversation');
    }

    const conversation = await conversationResponse.json();
    const conversationId = conversation.conversation_id;

    // Step 2: Extract file_id from the response's tool_file chunk [web:2]
    let fileId = null;
    const lastOutput = conversation.outputs[conversation.outputs.length - 1];

    if (lastOutput && lastOutput.content) {
      for (const chunk of lastOutput.content) {
        if (chunk.type === 'tool_file') {
          fileId = chunk.file_id;
          break;
        }
      }
    }

    if (!fileId) {
      return res.status(500).json({
        error: 'No image generated in the response',
      });
    }

    // Step 3: Get signed URL for the generated image [web:29]
    const signedUrlResponse = await fetch(`https://api.mistral.ai/v1/files/${fileId}/signed_url`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MISTRAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!signedUrlResponse.ok) {
      const error = await signedUrlResponse.json();
      throw new Error(error.message || 'Failed to get signed URL');
    }

    const signedUrlData = await signedUrlResponse.json();
    const imageSignedUrl = signedUrlData.url;

    // Step 4: Download the image from Mistral
    const imageDownloadResponse = await fetch(imageSignedUrl);
    if (!imageDownloadResponse.ok) {
      throw new Error('Failed to download image from Mistral');
    }
    const imageBuffer = await imageDownloadResponse.arrayBuffer();
    const imageBase64 = Buffer.from(imageBuffer).toString('base64');

    // Step 5: Upload to ImgBB [web:63][web:66][web:68]
    const imgbbUploadResponse = await fetch('https://api.imgbb.com/1/upload?key=' + IMGBB_API_KEY, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `image=${imageBase64}`,
    });

    if (!imgbbUploadResponse.ok) {
      const error = await imgbbUploadResponse.json();
      throw new Error(error.message || 'Failed to upload image to ImgBB');
    }

    const imgbbResponse = await imgbbUploadResponse.json();
    const imgbbImageUrl = imgbbResponse.data.url;

    // Return JSON response with ImgBB image_url
    res.json({
      agent_id: AGENT_ID,
      conversation_id: conversationId,
      file_id: fileId,
      image_url: imgbbImageUrl,
      status: 'success',
    });

  } catch (error) {
    console.error('Error generating image:', error);
    res.status(500).json({
      error: error.message || 'Failed to generate image',
    });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Using agent ID: ${AGENT_ID}`);
});
