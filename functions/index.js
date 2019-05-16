// See https://github.com/dialogflow/dialogflow-fulfillment-nodejs
// for Dialogflow fulfillment library docs, samples, and to report issues
'use strict';

const functions = require('firebase-functions');
const {WebhookClient} = require('dialogflow-fulfillment');
const {Card, Suggestion} = require('dialogflow-fulfillment');
const {BigQuery} = require('@google-cloud/bigquery');
const bigquery = new BigQuery();


process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements

const activeOutbreakCountries = [ {country: 'Brazil', city: 'Mogi Guaçu', disease: 'Dengue Fever'},
                                  {country: 'France', city: 'Paris', disease: 'Dengue Fever'},
                                  {country: 'Mozambique', city: 'Maputo', disease: 'Malaria'},
                                  {country: 'Zimbabwe', city: 'Manicaland', disease: 'Malaria'} ]

const triageLocations = {
  Paris: ['1 Parvis Notre-Dame - Pl. Jean-Paul II, 75004 Paris, France', '47-83 Boulevard de l\'Hôpital, 75013 Paris, France',
            '1 Avenue Claude Vellefaux, 75010 Paris, France', '2 Rue Ambroise Paré, 75010 Paris, France', '25 Rue Marbeuf, 75008 Paris, France'],
  mogi_guacu: ['R. Chico de Paula, 608 - Centro, Mogi Guaçu - SP, 13840-005, Brazil', 'Av. Augusta Viola da Costa, 805 - Jardim Celina, Araras - SP, 13606-020, Brazil',
              'Av. Newton Prado, 1883 - Centro, Pirassununga - SP, 13631-045, Brazil', 'R. Inácio Franco Alves, 561 - Parque Cidade Nova, Mogi-Guaçu - SP, 13845-420, Brazil'],
  Maputo: ['Avenida Do Trabalho, Maputo, Mozambique', '466 Av. Ahmed Sekou Touré, Maputo, Mozambique'],
  Manicaland: ['7 Mbuya Nehanda Street, Rusape, North Avenue, Rusape, Zimbabwe', '124 Herbert Chitepo St, Mutare, Zimbabwe', 'Mutare Provincial Hospital Box 30, Mutare, Zimbabwe']

}
const diseaseSymptomList = [
  {
    disease: 'Malaria',
    symptoms: ['Fever', 'Shaking Chills', 'Headache', 'Muscle Ache', 'Tiredness', 'Nausea', 'Vomiting']
  },
  {
    disease: 'Dengue Fever',
    symptoms: ['High Fever', 'Severe Headache', 'Eye Pain', 'Joint Pain', 'Muscle Pain', 'Bone Pain', 'Rash']
  }
];

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
      agent.add('Can you tell me your symptoms?');
    } else if(gotSymptom && gotCity) {
      agent.add(`I understand that you are currently experiencing ${symptom} on your trip to ${city}. Is this correct?`);

      agent.context.set({
        name: 'conditionintake-symptom-followup',
        lifespan: 1,
        parameters: {
          city: city,
          symptom: symptom
        }
      });

    }
    else {
      agent.add('I\'m sorry to hear you\'re not feeling well.');
      agent.add('Can you tell me your symptoms and where you are currently located?');
    }
  }

  function conditionIntakeSymptomFollowup(agent) {
    const conditionIntakeContext = agent.context.get('conditionintake-symptom-followup');

    console.log(conditionIntakeContext);

    const patientSymptoms = conditionIntakeContext.parameters.symptom;
    const city = conditionIntakeContext.parameters.city;

    let outbreakArea = activeOutbreakCountries.find(outbreak => outbreak.city === city);

    console.log(outbreakArea);

    if (outbreakArea) {
      agent.add(`I would like to gather some more information on your current condition. Could you please tell me if you're experiencing any of the following symptoms?`);

      let diseaseObj = diseaseSymptomList.find((dis) => {

        if (dis.disease === outbreakArea.disease) {
          return dis;
        }

      });

      let potentialOutbreakSymptoms = diseaseObj.symptoms.filter((symptom) => {

        if(!patientSymptoms.includes(symptom)) {
          return symptom;
        }

      });

      console.log(potentialOutbreakSymptoms);
      if(potentialOutbreakSymptoms.length > 3) {
        potentialOutbreakSymptoms = potentialOutbreakSymptoms.splice(0, 3);
      }

      agent.add(`- ${potentialOutbreakSymptoms.join('\n- ')}`);

      agent.context.set({
        name: 'conditionintake-symptom-analysis-followup',
        lifespan: 1,
        parameters: {
          city: city,
          symptom: patientSymptoms,
          outbreak: outbreakArea
        }
      });

    }
    else {
        let conv = agent.conv(); // Get Actions on Google library conv instance
        conv.close('Currently, there are no vector disease outbreaks in your area. If symptoms persist, please visit a local doctor at your earliest convienience.'); // Use Actions on Google library
        agent.add(conv); // Add Actions on Google library responses to your agent's responsex
    }

  }

  function conditionIntakeSymptomAnalysis(agent) {
    const conditionIntakeContext = agent.context.get('conditionintake-symptom-analysis-followup');

    const symptomFollowUpList = agent.parameters['Symptom'];
    const originalUserSymptomList = conditionIntakeContext.parameters.symptom;
    const outbreakDisease = conditionIntakeContext.parameters.outbreak.disease;
    let city = conditionIntakeContext.parameters.city;

    if(city === 'Mogi Guaçu') {
      city = 'mogi_guacu';
    }

    let diseaseObj = diseaseSymptomList.find((dis) => {

      if (dis.disease === outbreakDisease) {
        return dis;
      }

    });

    console.log(conditionIntakeContext);

    let allCollectedSymptoms = [...symptomFollowUpList, ...originalUserSymptomList];
    console.log(allCollectedSymptoms);

    let potentialOutbreakSymptoms = allCollectedSymptoms.filter(userSymptom => diseaseObj.symptoms.includes(userSymptom));

    console.log('potentialOutbreakSymptoms ' + potentialOutbreakSymptoms);

    let conv = agent.conv();
    if(potentialOutbreakSymptoms.length > 0) {
      if(triageLocations[city].length > 1) {
        agent.add('Thank you for your cooperation. Based on recent outbreaks in your area and the symptoms you\'re exhibiting, you may have ' + outbreakDisease + '. Please make your way to \n \n' + triageLocations[city][0] + '\n \n for immediate treatment.');
        agent.add('Would you like additional hospital locations in your area?');

        agent.context.set({
          name: 'hospital-followup',
          lifespan: 2,
          parameters: {
            city: city
          }
        });
      } else {
        conv.close('Thank you for your cooperation. You seem to be exhibiting symptoms of ' + outbreakDisease + '. \n Please make your way to: \n' + triageLocations[city][0] + '\n for immediate treatment.');
        agent.add(conv);
      }


    } else {
       // Get Actions on Google library conv instance
      conv.close('Thank you for your cooperation. You\'re symptoms do not seem to be related to any vector borne disease outbreaks in the area. Please visit your local doctor or physician if your symptoms continue to persist.');
      agent.add(conv);
    }


  }

  function hospitalFollowupIntent(agent) {
    const conditionIntakeContext = agent.context.get('hospital-followup');
    const city = conditionIntakeContext.parameters.city;
    console.log('final intent city: ' + city);

    let moreHospitalOptions = triageLocations[city].slice(1);
    console.log('moreHosOptions' + moreHospitalOptions);

    if(moreHospitalOptions.length > 1) {
      agent.add('There are other medical facilities located at: \n \n' + moreHospitalOptions[0] + ' \n \nand \n \n' + moreHospitalOptions[1]);
    } else {
      agent.add('There is another medical facility at \n' + moreHospitalOptions[0]);
    }


  }

  function warningAndPreventionIntent(agent) {
    let userCountry = agent.parameters['geo-country'];
    console.log(userCountry)

    if(userCountry[0] === 'Tanzania, United Republic of') {
      userCountry[0] = 'Tanzania';
    }

    const gotCountry = userCountry.length > 0;

    if(gotCountry) {
      agent.add('Im looking into your trip');

      const OPTIONS = {
              query: 'SELECT disease.name FROM `la-hackathon-agent.slalom_hackathon.cdc_disease`, unnest(disease) disease WHERE country = @country',
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
            diseaseList.push(row.name);
            console.log(diseaseList);
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
            query: 'SELECT disease.description FROM `la-hackathon-agent.slalom_hackathon.cdc_disease`, unnest(disease) disease where disease.name= @dis and country = @country',
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
      console.log(ROWS);

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
