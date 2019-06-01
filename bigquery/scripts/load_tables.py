# Initialize BigQuery environment
from google.cloud import bigquery
client = bigquery.Client()
dataset_id = 'evect_health'
dataset_ref = client.dataset(dataset_id)


# Retrieve files to be ingested into BigQuery
# BigQuery tables will reflect JSON file names
json_file_list=os.listdir('./data')
table_list=[x.split('.')[0] for x in json_file_list]

for json_file, table_name in zip(json_file_list, table_list):
	filename = './data/{}'.format(json_file)
	#table_id = '{}'.format(table_ref)
	###
	table_ref = dataset_ref.table(table_name)
	job_config = bigquery.LoadJobConfig()
	job_config.autodetect = True
	job_config.source_format = bigquery.SourceFormat.NEWLINE_DELIMITED_JSON
	###
	with open(filename, "rb") as source_file:
	    job = client.load_table_from_file(
	        source_file,
	        table_ref,
	        location="US",  # Must match the destination dataset location.
	        job_config=job_config,
	    )  # API request
###
	job.result()  # Waits for table load to complete.
###
	print("Loaded {} rows into {}:{}.".format(job.output_rows, dataset_id, table_name))