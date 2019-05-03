// See https://github.com/dialogflow/dialogflow-fulfillment-nodejs
// for Dialogflow fulfillment library docs, samples, and to report issues
'use strict';

const functions = require('firebase-functions');
const {WebhookClient} = require('dialogflow-fulfillment');
const {Card, Suggestion} = require('dialogflow-fulfillment');

process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
  const agent = new WebhookClient({ request, response });
  console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
  console.log('Dialogflow Request body: ' + JSON.stringify(request.body));

  function welcome(agent) {
    agent.add(`Welcome to my agent!`);
  }

  function fallback(agent) {
    agent.add(`I didn't understand`);
    agent.add(`I'm sorry, can you try again?`);
  }

  function conditionIntake(agent) {

    const symptom = agent.parameters['Symptom'];
    const organ = agent.parameters['Organ'];
    const city = agent.parameters['geo-city'];

    const gotSymptom = symptom.length > 0;
    const gotOrgan = organ.length > 0;
    const gotCity = city.length > 0;

    if(gotSymptom && !gotCity) {
      agent.add('What city are you currently located in?');
    } else if (!gotSymptom && gotCity) {
      agent.add('Can you tell me your Symptoms?');
    } else if(gotSymptom && gotCity) {

      if(gotOrgan) {
        agent.add(`I understand that you are experiencing ${symptom} in ${organ} on your trip to ${city}.`);
      } else {
        agent.add(`I understand that you are currently experiencing ${symptom} on your trip to ${city}.`);
      }

      agent.add(`How long have you been experiencing these symptoms?`);

      agent.setContext({
        name: 'conditionintake-followup',
        lifespan: 2,
        parameters: {
          city: city,
          symptom: symptom,
          organ: organ
        }
      });

    }
    else {
      agent.add('I\'m sorry to hear you\'re not feeling well.');
      agent.add('Can you tell me your symptoms and where you are currently located?');
    }
  }

  function conditionIntakeFollowup(agent) {
    const conditionIntakeContext = agent.getContext('conditionintake-followup');
    const duration = agent.parameters['duration'];
    console.log(agent.parameters);
    console.log(conditionIntakeContext);
    const displayUnit = toMomentUnit(duration.unit);
    const symptom = conditionIntakeContext.parameters.symptom;
    const city = conditionIntakeContext.parameters.city;
    agent.add('To confirm:');
    agent.add(`You are currently experiencing ${symptom} on your trip to ${city}.
				\n You have been experiencing these symptoms for ${duration.amount} ${displayUnit}.
				\n Is that correct?`);

  }

  function warningAndPreventionIntent(agent) {
    const city = agent.parameters['geo-city'];
    const country = agent.parameters['geo-country'];
    const region = agent.parameters['Region'];

    const gotCity = city.length > 0;
    const gotCountry = country.length > 0;
    const gotRegion = region.length > 0;

    if(gotRegion) {
    	agent.add(`Cool! Can you tell me the cities you'll be visiting on your trip to ${region}?`);
    }

    if(gotCountry) {
    	agent.add(`Cool! Can you tell me the cities you'll be visiting on your trip to ${country}?`);
    }

    if(gotCity) {
    	agent.add(`So you will be visiting ${city}?`);
    }

  }

  function aboutMe(agent) {
    agent.add('I am trained to provide warning and prevention tips to gaurd against vector borne diseases and epidemics based on your location.');
    agent.add(`I am also capable of monitoring disease outbreaks in major geographic locations.
				\n If you feel ill or unwell, please let me know what symptoms you are experiencing
				and where you are located.`);
  }

  function creatorIntent(agent) {
  	agent.add(`I was built by a team of technologists from the Slalom Los Angeles market
				that believe data can be harnessed for the greater good of our communities. \n \n
				Please reach out with any questions, concerns, or comments.`);
    agent.add(new Card({
         title: `Redefine what's possible`,
         imageUrl: 'https://d1.awsstatic.com/logos/partners/slalom-logo-blue-RGB.826a7ccc6b1972092669c775be9014b2ce5beedd.jpg',
         buttonText: 'Learn More',
         buttonUrl: 'https://www.slalom.com/'
       })
     );
  }

  const toMomentUnit = (unit) => {
    switch(unit) {
        case "min":
            return "minutes";
        case "h":
            return "hours";
        case "day":
            return "days";
        case "wk":
            return "weeks";
        case "mo":
            return "months";
        case "year":
            return "years";
        default:
            throw new Error("Unrecognized unit");
    }
  };

  // Run the proper function handler based on the matched Dialogflow intent name
  let intentMap = new Map();
  intentMap.set('Default Welcome Intent', welcome);
  intentMap.set('Default Fallback Intent', fallback);
  intentMap.set('Condition Intake', conditionIntake);
  intentMap.set('Condition Intake - Duration Followup', conditionIntakeFollowup);
  intentMap.set('eVect Statement of Purpose', aboutMe);
  intentMap.set('eVect Creation', creatorIntent);
  intentMap.set('Warning and Prevention', warningAndPreventionIntent);
  agent.handleRequest(intentMap);
});


  // // Uncomment and edit to make your own intent handler
  // // uncomment `intentMap.set('your intent name here', yourFunctionHandler);`
  // // below to get this function to be run when a Dialogflow intent is matched
  // function yourFunctionHandler(agent) {
  //   agent.add(`This message is from Dialogflow's Cloud Functions for Firebase editor!`);
  //   agent.add(new Card({
  //       title: `Title: this is a card title`,
  //       imageUrl: 'https://developers.google.com/actions/images/badges/XPM_BADGING_GoogleAssistant_VER.png',
  //       text: `This is the body text of a card.  You can even use line\n  breaks and emoji! 💁`,
  //       buttonText: 'This is a button',
  //       buttonUrl: 'https://assistant.google.com/'
  //     })
  //   );
  //   agent.add(new Suggestion(`Quick Reply`));
  //   agent.add(new Suggestion(`Suggestion`));
  //   agent.setContext({ name: 'weather', lifespan: 2, parameters: { city: 'Rome' }});
  // }

  // // Uncomment and edit to make your own Google Assistant intent handler
  // // uncomment `intentMap.set('your intent name here', googleAssistantHandler);`
  // // below to get this function to be run when a Dialogflow intent is matched
  // function googleAssistantHandler(agent) {
  //   let conv = agent.conv(); // Get Actions on Google library conv instance
  //   conv.ask('Hello from the Actions on Google client library!') // Use Actions on Google library
  //   agent.add(conv); // Add Actions on Google library responses to your agent's response
  // }
  // // See https://github.com/dialogflow/dialogflow-fulfillment-nodejs/tree/master/samples/actions-on-google
  // // for a complete Dialogflow fulfillment library Actions on Google client library v2 integration sample
