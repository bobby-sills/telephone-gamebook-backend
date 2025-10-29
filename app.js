const express = require('express');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const urlencoded = require('body-parser').urlencoded;
const { stories } = require('./stories.js');

const app = express();

// Parse incoming POST params with Express middleware
app.use(urlencoded({ extended: false }));

// Helper function to construct audio URL from GitHub raw content
// Audio files are served from GitHub's raw content CDN for reliability
function getAudioUrl(storyId, sectionId) {
  return `https://raw.githubusercontent.com/bobby-sills/telephone-gamebook-backend/main/public/${storyId}/${sectionId}.mp3`;
}

// Create a route that will handle Twilio webhook requests, sent as an
// HTTP POST to /voice in our application
app.post('/voice', (request, response) => {
  // Use the Twilio Node.js SDK to build an XML response
  const twiml = new VoiceResponse();

  // Play the pre-generated welcome menu audio
  const welcomeAudioUrl = `https://raw.githubusercontent.com/bobby-sills/telephone-gamebook-backend/main/public/welcome.mp3`;
  twiml.play(welcomeAudioUrl);
  twiml.pause({ length: 1 });

  const gather = twiml.gather({
    numDigits: 1,
    action: '/storyselect',
  });

  // Add a pause in gather to wait for user input
  gather.pause({ length: 10 });

  twiml.redirect('/voice');
  response.type('text/xml');
  response.send(twiml.toString());
});

app.post('/storyselect', (request, response) => {
  const twiml = new VoiceResponse();

  const selectedStory = stories[request.body.Digits - 1];

  twiml.redirect(`/stories/${selectedStory.id}/${selectedStory.start_section}`);
  response.type('text/xml');
  response.send(twiml.toString());
});

// Display a story section
app.post('/stories/:storyID/:sectionID', (request, response) => {
  const twiml = new VoiceResponse();
  const { storyID, sectionID } = request.params;

  // Find the story and section
  const story = stories.find(s => s.id === storyID);
  const section = story.sections[sectionID];

  // Play the audio file from GitHub (contains both section text and choice options)
  const audioUrl = getAudioUrl(storyID, sectionID);
  twiml.play(audioUrl);
  twiml.pause({ length: 1 });

  // Check if this is an ending
  if (section.is_ending) {
    // No choices - end the story
    twiml.pause({ length: 3 });
    twiml.hangup();
  } else {
    // Create gather for user choices
    const gather = twiml.gather({
      numDigits: 1,
      action: `/stories/${storyID}/${sectionID}/choice`
    });

    // Add a pause in gather to wait for user input
    gather.pause({ length: 10 });

    // If user doesn't press anything, repeat this section
    twiml.redirect(`/stories/${storyID}/${sectionID}`);
  }

  response.type('text/xml');
  response.send(twiml.toString());
});

// Handle user's choice and route to next section
app.post('/stories/:storyID/:sectionID/choice', (request, response) => {
  const twiml = new VoiceResponse();
  const { storyID, sectionID } = request.params;
  const digit = parseInt(request.body.Digits) - 1;  // Convert to 0-based index

  // Find the story and section
  const story = stories.find(s => s.id === storyID);
  const section = story.sections[sectionID];

  // Get the next section ID based on user's choice
  const nextSectionId = section.choices[digit].next_id;

  // Redirect to the next section
  twiml.redirect(`/stories/${storyID}/${nextSectionId}`);

  response.type('text/xml');
  response.send(twiml.toString());
});

// Export the Express app for Vercel serverless functions
module.exports = app;

// For local development, start the server if not in production
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  console.log(`Twilio Client app HTTP server running on port ${PORT}`);
  app.listen(PORT);
}
