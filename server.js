// server.js
import express from 'express';
import { MistralClient } from '@mistralai/mistralai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// Initialize Mistral client
const client = new MistralClient({
  apiKey: process.env.MISTRAL_API_KEY,
});

// Request schema (using JSDoc for clarity)
/**
 * @typedef {Object} ImageAgentRequest
 * @property {string} name - Agent name
 * @property {string} description - Agent description
 * @property {string} [instructions] - Agent instructions
 * @property {string} [model] - Model to use (default: mistral-medium-latest)
 * @property {string} input_prompt - Prompt for image generation
 * @property {string} [image_url] - Optional URL for image editing
 * @property {number} [temperature] - Temperature (default: 0.3)
 * @property {number} [top_p] - Top_p (default: 0.95)
 */

/**
 * POST /api/create-image-agent
 * Creates a Mistral agent with image generation tool and returns image_url
 */
app.post('/api/create-image-agent', async (req, res) => {
  try {
    const {
      name,
      description,
      instructions = 'Use the image generation tool when you have to create or edit images.',
      model = 'mistral-medium-latest',
      input_prompt,
      image_url,
      temperature = 0.7,
      top_p = 0.95,
    } = req.body;

    // Validate required fields
    if (!name || !description || !input_prompt) {
      return res.status(400).json({
        error: 'Missing required fields: name, description, input_prompt',
      });
    }

    // Create agent with image_generation tool [web:2]
    const imageAgent = await client.agents.create({
      model,
      name,
      description,
      instructions,
      tools: [{ type: 'image_generation' }],
      completionArgs: {
        temperature,
        top_p,
      },
    });

    const agentId = imageAgent.id;

    // Start conversation with the agent and generate image [web:2]
    const response = await client.conversations.start({
      agentId: agentId,
      inputs: input_prompt,
    });

    const conversationId = response.conversationId;

    // Extract file_id from the response's tool_file chunk [web:2]
    let fileId = null;
    const lastOutput = response.outputs[response.outputs.length - 1];

    if (lastOutput && lastOutput.content) {
      for (const chunk of lastOutput.content) {
        if (chunk.type === 'tool_file') {
          fileId = chunk.fileId;
          break;
        }
      }
    }

    // Get signed URL for the generated image [web:29]
    let imageUrl = null;
    if (fileId) {
      const signedUrlResponse = await client.files.getSignedUrl({ fileId });
      imageUrl = signedUrlResponse.url;
    }

    // Return JSON response with image_url
    res.json({
      agent_id: agentId,
      conversation_id: conversationId,
      file_id: fileId,
      image_url: imageUrl,
      status: 'success',
    });

  } catch (error) {
    console.error('Error creating image agent:', error);
    res.status(500).json({
      error: error.message || 'Failed to create image agent',
    });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
