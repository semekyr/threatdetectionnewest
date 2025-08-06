const {InfluxDB, Point} = require('@influxdata/influxdb-client');
const {DeleteAPI} = require('@influxdata/influxdb-client-apis');
const axios = require('axios');
require('dotenv').config({ path: './.env' });

class Database{
    constructor(token, organisation, bucket, url = process.env.INFLUX_URL.toString()) {
        this.token = token;
        this.token = token;
        this.org = organisation;
        this.bucket = bucket;
        this.url = url;
        this.query = null;

        this.client = new InfluxDB({url: this.url, token: this.token});
        this.queryAPI = this.client.getQueryApi(this.org);
        this.writeAPI = this.client.getWriteApi(this.org, this.bucket);
        this.writeAPI.useDefaultTags({host: 'host1'});
        
        // Create delete API using the APIs module
        this.deleteAPI = new DeleteAPI(this.client);
    }

    setOrganisation(org) {
        this.org = org;
        this.queryAPI = this.client.getQueryApi(this.org);
        this.writeAPI = this.client.getWriteApi(this.org, this.bucket);
    }

    setToken(token) {
        this.token = token;
        // Recreate client when token changes
        this.client = new InfluxDB({url: this.url, token: this.token});
        this.queryAPI = this.client.getQueryApi(this.org);
        this.writeAPI = this.client.getWriteApi(this.org, this.bucket);
        this.deleteAPI = new DeleteAPI(this.client);
    }

    setBucket(bucket){
        this.bucket = bucket;
        this.writeAPI = this.client.getWriteApi(this.org, this.bucket);
    }

    setURL(url) {
        this.url = url;
        // Recreate client when URL changes
        this.client = new InfluxDB({url: this.url, token: this.token});
        this.queryAPI = this.client.getQueryApi(this.org);
        this.writeAPI = this.client.getWriteApi(this.org, this.bucket);
        this.deleteAPI = new DeleteAPI(this.client);
    }

    setQuery(query){
        this.query = query;
    }

    getQuery(){
        return this.query;
    }

    getOrganisation(){
        return this.org;
    }

    getToken(){
        return this.token;
    }

    getBucket(){
        return this.bucket;
    }

    getURL(){
        return this.url;
    }

    async read() {
        if (!this.query) {
            console.warn('No query set');
            return [];
        }

        try {
            const results = [];
        
            // Using the promise-based approach
            await new Promise((resolve, reject) => {
                this.queryAPI.queryRows(this.query, {
                    next(row, tableMeta) {
                        const obj = tableMeta.toObject(row);
                        console.log(obj);
                        results.push(obj);
                    },
                    error(error) {
                        console.error('Query error:', error);
                        reject(error);
                    },
                    complete() {
                        resolve();
                    }
                });
            });

            return results;

        } catch (error) {
            console.error('Error querying InfluxDB:', error);
            return [];
        }
    } 

    async write(data){
        try {
            const points = Array.isArray(data) ? data : [data];
            this.writeAPI.writePoints(points);
            await this.writeAPI.flush();
            await this.writeAPI.close();
            console.log("Write operation completed successfully");
        } catch (error) {
            console.error(`Write error: ${error}`);
            throw error;
        }
    }

    async delete(measurement, tagMap = {}){
        try {
            const tagPredicates = Object.entries(tagMap)
                .map(([key, value]) => `${key}="${value}"`)
                .join(' AND ');

            const predicate = `_measurement="${measurement}"` + (tagPredicates ? ` AND ${tagPredicates}` : '');
            
            console.log('Delete predicate:', predicate);
            console.log('Delete bucket:', this.bucket);
            console.log('Delete org:', this.org);

            const deleteData = {
                start: '1970-01-01T00:00:00Z',
                stop: new Date().toISOString(),
                predicate: predicate
            };

            const response = await axios.post(
                `${this.url}/api/v2/delete`,
                deleteData,
                {
                    headers: {
                        'Authorization': `Token ${this.token}`,
                        'Content-Type': 'application/json'
                    },
                    params: {
                        org: this.org,
                        bucket: this.bucket
                    }
                }
            );
            
            console.log('Delete operation completed successfully');
            return response.data;
        } catch (error) {
            console.error('Delete error:', error);
            if (error.response) {
                console.error('Response data:', error.response.data);
                console.error('Response status:', error.response.status);
            }
            throw error;
        }
    }
}

module.exports = Database;