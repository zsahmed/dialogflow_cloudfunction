# DialogFlow Agent and Cloud Function eVect Example

*Demonstrates a Dialogflow Agent running on GCP Cloud Functions with BiqQuery integration.*

## DialogFlow Agent

Agents are best described as Natural Language Understanding (NLU) modules.
This **eVect** agent is trained to ingest text and spoken user requests and provide disease, health, and medical information.
This translation occurs when a user's utterance matches an intent within the **eVect** agent.

The DialogFlow agent is responsible for handling *Intents*, *Entities*, and *Fulfillment* of user requests.

#### Import eVect Agent

The **eVect** agent can be found in its entirety under `eVect_agent/eVect.zip`.
This zip file contains all of the JSON files related to the agent (Intents, Training Phases, Contexts, etc.)
Simply import this zip file in the DialogFlow web console to create the **eVect** agent.

## DialogFlow Intents

The eVect DialogFlow Agent currently has two features: **Warning and Prevention** and **Condition Intake** which are comprised of several Intents.

#### Warning and Prevention

Warning and Prevention is comprised of one Intent, and a follow-up Intent.
This flow is for users that want health and disease information about a country they will be visiting.
An example conversation:

```
[user]: I am traveling to Indonesia next week.

[agent]:
Im looking into your trip
Here is a list of active diseases and contagions in Indonesia.

- Measles
- Hepatitis A
- Typhoid

If you would like prevention tips on a disease, respond with the name of the disease.

[user]: Tell me more about typhoid.

[agent]:
Let me look up some prevention tips for that.You can get typhoid through contaminated food or water in Indonesia.
CDC recommends this vaccine for most travelers, especially if you are staying with friends or relatives, visiting smaller cities or rural areas, or if you are an adventurous eater.

```


##### Training

The initial **Warning and Prevention** intent is triggered by the user describing a future trip to a country. Sample test phrases include:

I will be traveling to South America.

I'm visiting family in England.

I am backpacking across Africa.

I'm going to Indonesia.

#### Condition Intake
Condition Intake is comprised of one Intent, and 3 follow-up Intents.

## DialogFlow Entities

Entities are Dialogflow's mechanism for identifying and extracting useful data from natural language inputs.
DialogFlow comes pre-built with several system Entities such as `geo-country` or `geo-city` that can be utilized out of the box.
In addition to those pre-built Entities **eVect** relies on the following custom trained Entities:

`@Disease`

`@Symptom`

The `@Disease` Entity is used to capture when a user mentions a Disease such as `Polio`, `Malaria`, or `Typhoid`.

The `@Symptom` Entity is used to capture when a user mentions their symptoms such as `Joint Pain`, `Nausea`, or `Fever`.

Entities can be trained and created from the DialogFlow console.

## DialogFlow Fulfillment

Fulfillment is handled via web hook to a GCP Cloud Function. Each intent and follow-up intent has a corresponding
function within `functions/index.js`. The function handler must be mapped to the intent:

```javascript
  let intentMap = new Map();
  intentMap.set('Warning and Prevention', warningAndPreventionIntent);
  intentMap.set('Warning and Prevention - followup', warningAndPreventionFollowup);
  agent.handleRequest(intentMap);
```

#### DialogFlow Agent

DialogFlow sends in an `agent` object to every function handler. The agent is used to handle conversation and context state.
For example, when a user says `I will be traveling to Indonesia`, the agent captures the value of `Indonesia` as a `geo-country`:

```javascript
  function warningAndPreventionIntent(agent) {
    let userCountry = agent.parameters['geo-country'];
```

The agent is also used to respond to user inputs and queries. Use the `agent.add()` function to respond to the user:

```javascript
    const gotCountry = userCountry.length > 0;

    if(gotCountry) {
      agent.add('Im looking into your trip');
    }
```

#### Cloud Function BigQuery Integration
Once DialogFlow has the proper input arguments from the user, Cloud Functions will query Big Query:

```javascript
      const OPTIONS = {
              query: 'SELECT disease.name FROM `la-hackathon-agent.slalom_hackathon.cdc_disease`, unnest(disease) disease WHERE country = @country',
              timeoutMs: 10000,
              useLegacySql: false,
              params: {country: userCountry[0]}
      };

      return bigquery
      .query(OPTIONS)
      .then(results => {
          const ROWS = results[0];
          let diseaseList = [];

          if(ROWS.length > 1) {
            agent.add(`Here is a list of active diseases and contagions in ${userCountry}. \n - ${diseaseList.join('\n - ')} \nIf you would like prevention tips on a disease, respond with the name of the disease.`);
```

Using `agent.add()` DialogFlow can respond to the user request dynamically with the BigQuery results.

##### Intent Context

In order for Dialogflow follow-up intents to understand the context of the conversation,
Dialogflow contexts can be used. Contexts essentially act as an event bus, being used to pass user input values
to follow-up contexts.

When the agent asks the user to select a disease to learn more about, the `country` parameter
is added to the context object to be used by a future intent:

```javascript
agent.context.set({
  name: 'prevention-followup',
  lifespan: 2,
  parameters: {
    country: userCountry
  }
});
```

The `country` context parameter is then utilized in a follow-up intent's Big Query call:

```javascript
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
```

##### Fulfillment Deployment

This DialogFlow webhook is hosted on **Cloud Functions for Firebase**.
[Node.js](https://nodejs.org/en/) is required to deploy the Fulfillment.

1. Setup Firebase CLI

   `npm install -g firebase-tools`

2. Authenticate

   `firebase login`

3. Initialize Firebase

   ```bash
   firebase init
   ```

4. Deploy the Cloud Function

   ```bash
    npm install
    firebase deploy --only functions
    ```

Once the Cloud Function is deployed, head to the Dialogflow console navigation menu.
Click Fulfillment, toggle the Webhook button to ENABLED , and replace the url in the URL field with your Function URL.
