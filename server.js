// server.js
import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// API key
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;

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
      temperature = 0.3,
      top_p = 0.95,
    } = req.body;

    // Validate required fields
    if (!name || !description || !input_prompt) {
      return res.status(400).json({
        error: 'Missing required fields: name, description, input_prompt',
      });
    }

    // Step 1: Create agent with image_generation tool using REST API [web:62]
    const agentResponse = await fetch('https://api.mistral.ai/v1/agents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MISTRAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        name,
        description,
        instructions,
        tools: [{ type: 'image_generation' }],
        completion_args: {
          temperature,
          top_p,
        },
      }),
    });

    if (!agentResponse.ok) {
      const error = await agentResponse.json();
      throw new Error(error.message || 'Failed to create agent');
    }

    const agent = await agentResponse.json();
    const agentId = agent.id;

    // Step 2: Start conversation with the agent and generate image [web:11][web:54]
    const conversationResponse = await fetch('https://api.mistral.ai/v1/conversations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MISTRAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        agent_id: agentId,
        inputs: input_prompt,
      }),
    });

    if (!conversationResponse.ok) {
      const error = await conversationResponse.json();
      throw new Error(error.message || 'Failed to start conversation');
    }

    const conversation = await conversationResponse.json();
    const conversationId = conversation.conversation_id;

    // Step 3: Extract file_id from the response's tool_file chunk [web:2]
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

    // Step 4: Get signed URL for the generated image [web:29]
    let imageUrl = null;
    if (fileId) {
      const signedUrlResponse = await fetch(`https://api.mistral.ai/v1/files/${fileId}/signed_url`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${MISTRAL_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      if (signedUrlResponse.ok) {
        const signedUrlData = await signedUrlResponse.json();
        imageUrl = signedUrlData.url;
      }
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
