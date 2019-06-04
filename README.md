# eVect Health Dialogflow Agent and Cloud Function Example

**6/3/2019**

eVect Health is a chatbot application built on GCP that uses a Dialogflow Agent trained to ingest text and spoken user requests 
and provide health and medical information pertaining to vector borne illnesses. 
The Dialogflow’s pre-trained natural language processing capabilities allow users to intelligently converse with the application. 
The Agent accesses data stored in BigQuery.

*3rd place winner of Slalom's 2019 Open Data Hackathon.*

## Dialogflow Agent

Agents are best described as Natural Language Understanding (NLU) modules.
This **eVect** agent is trained to ingest text and spoken user requests and provide disease, health, and medical information.
This translation occurs when a user's utterance matches an intent within the **eVect** agent.

The Dialogflow agent is responsible for handling *Intents*, *Entities*, and *Fulfillment* of user requests.

### Import eVect Agent

The **eVect** agent can be found in its entirety under `dialogflow_agent/eVect.zip`.
This zip file contains all of the JSON files related to the agent (Intents, Training Phases, Contexts, etc.)
Simply import this zip file in the Dialogflow web console to create the **eVect** agent.

## Dialogflow Intents

The eVect Dialogflow Agent currently has two features: **Warning and Prevention** and **Condition Intake** which are comprised of several Intents.

### Warning and Prevention

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


#### Training

The initial **Warning and Prevention** intent is triggered by the user describing a future trip to a country. Sample test phrases include:

`I will be traveling to South America.`

`I'm visiting family in England.`

`I am backpacking across Africa.`

`I'm going to Indonesia.`

### Condition Intake
Condition Intake is comprised of one Intent, and 3 follow-up Intents. This intent is triggered when user's
tell the agent they are not feeling well on their trip.

An example conversation:

```
[agent]: Good day! What can I do for you today?

[user]: I'm experiencing a high fever on my trip

[agent]: What city are you currently located in?

[user]: Paris.

[agent]: I understand that you are currently experiencing High Fever on your trip to Paris. Is this correct?

[user] : Yes.

[agent]:
I would like to gather some more information on your current condition.
Could you please tell me if you're experiencing any of the following symptoms?
- Severe Headache
- Joint Pain
- Eye Pain

[user]: I'm also experiencing a severe headache and eye pain.

[agent]:
Thank you for your cooperation.
Based on recent outbreaks in your area and the symptoms you're exhibiting, you may have Dengue Fever.
Please make your way to

1 Parvis Notre-Dame - Pl. Jean-Paul II, 75004 Paris, France

for immediate treatment. Would you like additional hospital locations in your area?

[user]: Yes please give me more hospital options.

[agent]:
There are other medical facilities located at:

47-83 Boulevard de l'Hôpital, 75013 Paris, France

and

1 Avenue Claude Vellefaux, 75010 Paris, France
```

#### Training

The initial **Condition Intake** intent is triggered by the user describing symptoms of their condition or mentioning that they feel unwell.
Sample test phrases include:

`I'm experiencing muscle pain in London.`

`I have back pain and a fever.`

`Everything hurts.`

`I feel sick in Hong Kong.`

## Dialogflow Entities

Entities are Dialogflow's mechanism for identifying and extracting useful data from natural language inputs.
Dialogflow comes pre-built with several system Entities such as `geo-country` or `geo-city` that can be utilized out of the box.
In addition to those pre-built Entities **eVect** relies on the following custom trained Entities:

`@Disease`

`@Symptom`

The `@Disease` Entity is used to capture when a user mentions a Disease such as `Polio`, `Malaria`, or `Typhoid`.

The `@Symptom` Entity is used to capture when a user mentions their symptoms such as `Joint Pain`, `Nausea`, or `Fever`.

Entities can be trained and created from the Dialogflow console.

## Dialogflow Fulfillment

Fulfillment is handled via web hook to a GCP Cloud Function. Each intent and follow-up intent has a corresponding
function within `functions/index.js`. The function handler must be mapped to the intent:

```javascript
  let intentMap = new Map();
  intentMap.set('Warning and Prevention', warningAndPreventionIntent);
  intentMap.set('Warning and Prevention - followup', warningAndPreventionFollowup);
  agent.handleRequest(intentMap);
```

#### Dialogflow Agent

Dialogflow sends in an `agent` object to every function handler. The agent is used to handle conversation and context state.
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
Once Dialogflow has the proper input arguments from the user, Cloud Functions will query BigQuery:

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

Using `agent.add()` Dialogflow can respond to the user request dynamically with the BigQuery results.

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

The `country` context parameter is then utilized in a follow-up intent's BigQuery call:

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

This Dialogflow webhook is hosted on **Cloud Functions for Firebase**.
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

## eVect BigQuery Database

Data used to power eVect stems from a variety of different public sources. The data allow the Dialogflow agent smartly process several related questions by an end user, all stemming from very different sources. Data were accessed via public APIs or public FTP sites and then lightly processed into **newline delimited JSON (NDJSON)** using **[jq](https://github.com/stedolan/jq)** Data were then loaded to BigQuery using the [BigQuery Python Client](https://googleapis.github.io/google-cloud-python/latest/bigquery/index.html). 

#### Data Sources

This repo contains the load NDJSON formatted data and Python load scripts in the `bigquery` directory. Data files are located in `bigquery/data/*`. Included below is a short description and original location of the principal data sources:

- CDC Traveler Data: includes detailed prevention tips on diseases by country, including traveler sub-group entity (e.g. traveling with children, pregnant women). 
**Source:** [CDC Travel](https://wwwnc.cdc.gov/travel/)

- Disease Symptom Data: includes common and principal symptoms related to various vector-borne diseases, broken out by traveler sub-group entity.
**Source:** [CDC Disease Symptoms and Treatment Pages (example for Dengue Fever)](https://www.cdc.gov/dengue/symptoms/index.html)

- Disease Outbreak Data: includes current vector-borne illness outbreaks in cities throughout the world. **Sources:** [HealthMap](https://www.healthmap.org/en/) and [Global Incident Map, Outbreaks](https://outbreaks.globalincidentmap.com/)

- Hospital and Treatment Center Data: includes the name, address, and type of treatment center by country and city entities. 
**Source:** [CDC Travel](https://wwwnc.cdc.gov/travel/)

#### BigQuery Setup

BigQuery setup is automated using a set of short Python scripts that use the [BigQuery Python Client](https://googleapis.github.io/google-cloud-python/latest/bigquery/index.html). These scripts are found in the repo under `bigquery/scripts/*.py`. To run these scripts, users may download the BigQuery Client locally using `virtualenv` and pip or simply use the Cloud Shell. The scripts contains two files:

1. `create_dataset.py` creates a new dataset called `evect_health` within the user's GCP project.

2. `load_tables.py` accesses the NDJSON files in `bigquery/data/` and creates a table for each of the raw data files. 

This provides a dataset containing several tables referenced by the Dialogflow Agent. One notable feature we used was **[schema auto-detection]**(https://cloud.google.com/bigquery/docs/schema-detect), which scans up to 100 rows of the source file in a representative manner before inferring each field's data type. We simply enable schema auto-detection by invoking `job_config.autodetect = True` in the Python API calls to create each table.


#### BigQuery St

## Performance

Overall, the Dialogflow Agent preformed very well given the training data used. Here are some highlights:

1. Latency from Cloud Function backed fulfillment is very responsive. When querying BigQuery, responses returned within
400 - 1200ms. If there is no query required for the Intent, fulfillment responded incredibly fast in about 10ms.

2. Dialogflow has excellent scalability when backed by serverless Cloud Functions. 

3. Dialogflow integrates with many popular platforms such as Facebook Messenger, Slack, and Google Assistant.
   Testing on Google Assistant is as easy as logging in with your GCP project email account and saying:
   
   `Talk to my test app.`
   
   This makes deployments of test code and training data incredible easy with one-click integrations and
   can massively speed up development time.

4. The Agent ingests training data within minutes, allowing for quick and easy testing and development cycles.

5. The Agent has difficulty understanding native English speakers when pronouncing non-native city locations.
For example, the Agent could not pick up `Mogi Guaçu` when pronounced by a native English speaker.

    Fortunately, the Agent will accept both speech and text, so the remedy for these scenarios could
    be to simply use the keyboard when speaking to the Agent over Google Assistant.

6. There have been some cases of inconsistencies with the built in Entities on Google Dialogflow
   based on which platform the user is testing with.

   For example, when a user mentions `Tanzania`, the Dialogflow console will resolve the value to `Tanzania`
   but when testing on Google Assistant, `Tanzania` resolved to `Tanzania, United Republic of`. This has to be 
   manually handled in the codebase.
   
## Next Steps

While this was a simple MVP to showcase the power of Dialogflow backed by BigQuery and Cloud Functions,
there are several feature enhancements that could be made to make the Agent even more powerful.
Here are some potential next steps:

1. Gather more data for BigQuery data and automate ingestion.

   The data used by this MVP is just a small sample set of all the vector borne diseases that are tracked
   across the globe. Ingesting global information would make the Agent more robust and able to assist
   more users across the world. Data could be pulled in a number of ways, such as Cloud Functions triggered by Cloud Scheduler to access API endpoints or streamed in and written to BigQuery using Pub/Sub and Dataflow.
   
2. Persist user conversations.

   To better tailor the Agent to understand what information users are requesting, user conversations should be
   persisted after the conversation to be used in training the Agent. This will lead to more fluid and natural 
   interactions with the Agent.
   
   Furthermore, Entities mentioned by the user such as `Symptoms` and `geo-city` should also be persisted. Storing these entity data could allow the creation of a native analytics service, providing descriptive and predictive statistics about where and when outbreaks of diseases occur based on user input. These early detection systems would allow the Dialogflow Agent to utilize an in-house custom model in addition to CDC and other government data. Such a data repository would also be helpful to public health researchers and government agencies seeking to track the spread of vector borne diseases.

3. Multilingual Agent support.

   eVect Health provides health and medical information for countries and cities throughout the world. However, the Agent currently only interprets English inputs. Future iterations may include support for other languages, enabling non English speakers throughout the globe to interact with the application. Dialogflow currently supports speech-to-text/speech recognition for [20 of the most common global languages](https://cloud.google.com/dialogflow-enterprise/docs/reference/language) in addition to regional dialects. 
    

