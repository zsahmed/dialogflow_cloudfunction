// See https://github.com/dialogflow/dialogflow-fulfillment-nodejs
// for Dialogflow fulfillment library docs, samples, and to report issues
'use strict';

const functions = require('firebase-functions');
const {WebhookClient} = require('dialogflow-fulfillment');
const {Card, Suggestion} = require('dialogflow-fulfillment');
const BigQuery = require('@google-cloud/bigquery');
const bigquery = new BigQuery();


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
    let city = agent.parameters['geo-city'];

    const gotSymptom = symptom.length > 0;
    const gotOrgan = organ.length > 0;
    const gotCity = city.length > 0;

    if(gotSymptom && !gotCity) {
      agent.add('What city are you currently located in?');
    } else if (!gotSymptom && gotCity) {
      agent.add('Can you tell me your symptoms?');
    } else if(gotSymptom && gotCity) {

      if(city === 'Mogi Guaçu') {
        city = 'Mogi Guacu';
      }

      const OPTIONS = {
              query: 'SELECT city.city, outbreak.disease FROM `la-hackathon-agent.evect_health.city_country_outbreak`, UNNEST(city) city LEFT JOIN UNNEST(city.outbreak) outbreak WHERE city.city=@city',
              params: {city: city}
      };

      return bigquery.query(OPTIONS).then(results => {
        console.log(JSON.stringify(results[0][0]));

        agent.add(`I understand that you are currently experiencing ${symptom} on your trip to ${city}. Is this correct?`);

        agent.context.set({
          name: 'conditionintake-symptom-followup',
          lifespan: 1,
          parameters: {
            city: city,
            symptom: symptom,
            outbreakArea: results[0][0]
          }
        });
        return true;

      }).catch(err => {
        console.log(err);
      });

    }
    else {
      agent.add('I\'m sorry to hear you\'re not feeling well.');
      agent.add('Can you tell me your symptoms and where you are currently located?');
    }
  }

  function conditionIntakeSymptomFollowup(agent) {
    const conditionIntakeContext = agent.context.get('conditionintake-symptom-followup');

    const patientSymptoms = conditionIntakeContext.parameters.symptom;
    const city = conditionIntakeContext.parameters.city;

    let outbreakArea = conditionIntakeContext.parameters.outbreakArea;

    if (!outbreakArea) {
      let conv = agent.conv(); // Get Actions on Google library conv instance
      conv.close('Currently, there are no vector disease outbreaks in your area. If symptoms persist, please visit a local doctor at your earliest convienience.'); // Use Actions on Google library
      agent.add(conv); // Add Actions on Google library responses to your agent's responsex

      return true;
    }

      agent.add(`I would like to gather some more information on your current condition. Could you please tell me if you're experiencing any of the following symptoms?`);

      const OPTIONS = {
              query: 'SELECT distinct symptom.name FROM `la-hackathon-agent.evect_health.disease_symptoms`, UNNEST(traveler_type) traveler_type LEFT JOIN UNNEST(traveler_type.symptom) AS symptom WHERE disease_name = @disease AND symptom.PRINCIPAL_SYMPTOM = \'X\'',
              params: {disease: outbreakArea.disease}
      };

      return bigquery.query(OPTIONS).then(results => {
        const potentialOutbreakSymptoms = results[0];

        let displaySymptoms = [];
        let outbreakSymptomsList = [];

        potentialOutbreakSymptoms.forEach((element, index, array) => {
          outbreakSymptomsList.push(element.name);

          if(!patientSymptoms.includes(element.name)) {
            displaySymptoms.push(element.name);
          }
        });

        if(displaySymptoms.length > 5) {
          displaySymptoms = displaySymptoms.splice(0, 5);
        }

        agent.add(`- ${displaySymptoms.join('\n- ')}`);

        agent.context.set({
          name: 'conditionintake-symptom-analysis-followup',
          lifespan: 1,
          parameters: {
            city: city,
            symptom: patientSymptoms,
            allOutbreakSymptoms: outbreakSymptomsList,
            outbreakArea: outbreakArea
          }
        });

        return true;
      }).catch(err => {
        console.log(err);
      });

  }

  function conditionIntakeSymptomAnalysis(agent) {
    const conditionIntakeContext = agent.context.get('conditionintake-symptom-analysis-followup');

    const symptomFollowUpList = agent.parameters['Symptom'];
    const originalUserSymptomList = conditionIntakeContext.parameters.symptom;
    const allOutbreakSymptoms = conditionIntakeContext.parameters.allOutbreakSymptoms;
    const outbreakDisease = conditionIntakeContext.parameters.outbreakArea.disease;
    let city = conditionIntakeContext.parameters.city;

    let allCollectedSymptoms = [...symptomFollowUpList, ...originalUserSymptomList];

    let potentialOutbreakSymptoms = allCollectedSymptoms.filter(userSymptom => allOutbreakSymptoms.includes(userSymptom));

    let conv = agent.conv();
    if(potentialOutbreakSymptoms.length > 0) {

      const OPTIONS = {
              query: 'SELECT treatment_center.address from `la-hackathon-agent.evect_health.treatment_centers`, UNNEST(city) city LEFT JOIN UNNEST(city.treatment_center) treatment_center WHERE city.city = @city',
              params: {city: city}
      };

      return bigquery.query(OPTIONS).then(results => {
        console.log(JSON.stringify(results));
        let treatmentCenters = results[0];

        if(treatmentCenters.length > 1) {
          agent.add('Thank you for your cooperation. Based on recent outbreaks in your area and the symptoms you\'re exhibiting, you may have ' + outbreakDisease + '. Please make your way to \n \n' + treatmentCenters[0].address + '\n \n for immediate treatment.');
          agent.add('Would you like additional hospital locations in your area?');

          agent.context.set({
            name: 'hospital-followup',
            lifespan: 2,
            parameters: {
              city: city,
              treatmentCenters: treatmentCenters
            }
          });
        } else {
          conv.close('Thank you for your cooperation. You seem to be exhibiting symptoms of ' + outbreakDisease + '. \n Please make your way to: \n' + treatmentCenters[0].address + '\n for immediate treatment.');
          agent.add(conv);
        }

        return true;

      }).catch(err => {
        console.log(err);
      })


    } else {
       // Get Actions on Google library conv instance
      conv.close('Thank you for your cooperation. You\'re symptoms do not seem to be related to any vector borne disease outbreaks in the area. Please visit your local doctor or physician if your symptoms continue to persist.');
      agent.add(conv);
    }


  }

  function hospitalFollowupIntent(agent) {
    const conditionIntakeContext = agent.context.get('hospital-followup');
    const treatmentCenters = conditionIntakeContext.parameters.treatmentCenters;

    if(treatmentCenters.length > 2) {
      agent.add('There are other medical facilities located at: \n \n' + treatmentCenters[1].address + ' \n \nand \n \n' + treatmentCenters[2].address);
    } else {
      agent.add('There is another medical facility at \n' + treatmentCenters[1].address);
    }

  }

  function warningAndPreventionIntent(agent) {
    let userCountry = agent.parameters['geo-country'];

    // Dialogflow and Google Actions have different values for Tanzania, so we normalize the values here for the query.
    if(userCountry[0] === 'Tanzania, United Republic of') {
      userCountry[0] = 'Tanzania';
    }

    const gotCountry = userCountry.length > 0;

    if(gotCountry) {
      agent.add('Im looking into your trip');

      const OPTIONS = {
              query: 'SELECT disease.name FROM `la-hackathon-agent.evect_health.disease_prevention`, unnest(disease) disease WHERE country = @country',
              timeoutMs: 10000,
              useLegacySql: false,
              params: {country: userCountry[0]}
      };

      return bigquery
      .query(OPTIONS)
      .then(results => {
          console.log(JSON.stringify(results[0]))
          const ROWS = results[0];

          let diseaseList = [];

          for(var row of ROWS) {
            if(row.name !== 'Routine Vaccines') {
              diseaseList.push(row.name);
            }
          }

          if(ROWS.length > 1) {
            agent.add(`Here is a list of active diseases and contagions in ${userCountry}. \n - ${diseaseList.join('\n - ')} \nIf you would like prevention tips on a disease, respond with the name of the disease.`);

            agent.context.set({
              name: 'prevention-followup',
              lifespan: 2,
              parameters: {
                country: userCountry
              }
            });

          } else {
            agent.add(`There doesn't seem to be any active vector diseases in ${userCountry}. Enjoy your trip!`);
          }

          return true;

      })
      .catch(err => {
        console.error('ERROR:', err);
      });
    }

  }

  function warningAndPreventionFollowup(agent) {
    const preventionContext = agent.context.get('prevention-followup');
    const disease = agent.parameters['Disease'];
    const userCountry = preventionContext.parameters['country'];

    const OPTIONS = {
            query: 'SELECT disease.description FROM `la-hackathon-agent.evect_health.disease_prevention`, unnest(disease) disease where disease.name= @dis and country = @country',
            timeoutMs: 10000,
            useLegacySql: false,
            params: {dis: disease, country: userCountry[0]}
    };

    return bigquery
    .query(OPTIONS)
    .then(results => {
      agent.add('Let me look up some prevention tips for that.');
      console.log(JSON.stringify(results[0]))
      const ROWS = results[0];

      agent.add(ROWS[0].description);

      return true;

    })
    .catch(err => {
      console.error('ERROR:', err);
    });
  }


  function aboutMe(agent) {
    agent.add('I am trained to provide warning and prevention tips to gaurd against vector borne diseases and epidemics based on your location.');
    agent.add(`I am also capable of monitoring disease outbreaks in major geographic locations.
				\nIf you feel ill or unwell, please let me know what symptoms you are experiencing and where you are located.`);
  }

  function creatorIntent(agent) {
  	agent.add(`I was built by a team of technologists from the Slalom Los Angeles market that believe data can be harnessed for the greater good of our communities. \n \nPlease reach out with any questions, concerns, or comments.`);
    agent.add(new Card({
         title: `Redefine what's possible`,
         imageUrl: 'https://d1.awsstatic.com/logos/partners/slalom-logo-blue-RGB.826a7ccc6b1972092669c775be9014b2ce5beedd.jpg',
         buttonText: 'Learn More',
         buttonUrl: 'https://www.slalom.com/'
       })
     );
  }

  function indonesiaAndTanzaniaTest(agent) {
    agent.add('I am querying my database.');

    const OPTIONS = {
            query: 'SELECT country, disease.name FROM `la-hackathon-agent.slalom_hackathon.cdc_disease`, unnest(disease) disease WHERE country = @country',
            timeoutMs: 10000,
            useLegacySql: false,
            queryParameters: {}
    };

    return bigquery
    .query(OPTIONS)
    .then(results => {
        console.log(JSON.stringify(results))
        console.log(JSON.stringify(results[0]))
        const ROWS = results[0];
        console.log('SQL Completed ' + ROWS[0].predicted_label);
        agent.add('The request was completed')

        return true;

    })
    .catch(err => {
      console.error('ERROR:', err);
    });

  }

  // Run the proper function handler based on the matched Dialogflow intent name
  let intentMap = new Map();
  intentMap.set('Default Welcome Intent', welcome);
  intentMap.set('Default Fallback Intent', fallback);
  intentMap.set('Condition Intake', conditionIntake);
  intentMap.set('Condition Intake - Symptom Followup', conditionIntakeSymptomFollowup);
  intentMap.set('Condition Intake - Symptom Analysis', conditionIntakeSymptomAnalysis);
  intentMap.set('Condition Intake - Hospital Followup', hospitalFollowupIntent);
  intentMap.set('eVect Statement of Purpose', aboutMe);
  intentMap.set('eVect Creation', creatorIntent);
  intentMap.set('Warning and Prevention', warningAndPreventionIntent);
  intentMap.set('Warning and Prevention - followup', warningAndPreventionFollowup);
  intentMap.set('Indonesia and Tanzania Test', indonesiaAndTanzaniaTest);
  agent.handleRequest(intentMap);
});
