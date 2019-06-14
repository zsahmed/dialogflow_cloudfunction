# Set up BigQuery dataset
from google.cloud import bigquery

# Construct a BigQuery client object.
client = bigquery.Client()

# Set dataset_id to the ID of the dataset to create.
# We use the dataset name "evect_health" to keep consistent 
# the Dialogflow Agent.
dataset_id = "{}.evect_health".format(client.project)

# Construct a full Dataset object to send to the API.
dataset = bigquery.Dataset(dataset_id)

# Specify the geographic location where the dataset should reside.
dataset.location = "US"

# Provide a dataset description
dataset.description = "Dataset to house all eVect Health Dialogflow data."

# Send the dataset to the API for creation.
# Raises google.api_core.exceptions.Conflict if the Dataset already
# exists within the project.
dataset = client.create_dataset(dataset)  # API request
print("Created dataset {}.{}".format(client.project, dataset.dataset_id))
