// Description: Main application file for the 3DEXPERIENCE Event Broker

// Import required modules
const stompit = require('stompit');
const WebSocket = require('ws');
const axios = require('axios');

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';

function log_timestamp() {
  const now = new Date();
  return now.toISOString(); // e.g., "2024-12-06T18:30:00.000Z"
}

function info(message) {
  console.log(`[${log_timestamp()}] ${GREEN}[INFO]${RESET} ${message}`);
}

// Function to log WARN messages in yellow
function warn(message) {
  console.log(`[${log_timestamp()}] ${YELLOW}[WARN]${RESET} ${message}`);
}

// Function to log ERROR messages in red
function error(message) {
  console.log(`[${log_timestamp()}] ${RED}[ERROR]${RESET} ${message}`);
}

// Define the base URL and document path
const baseUrl = "https://R1132102747346-eu1-space.3dexperience.3ds.com/enovia";
const documentPath = "/resources/v1/modeler/documents/A8FB660E096A25006751EE34000009B1";
const securityContext = "VPLMCreator.Company Name.Common Space";

// Definition of the login and the password for the 3DExperience Agent
const login = 'b3935f56-98da-4d38-ab19-6a44660cdb11';
const password = '$h~$7p4!:q=LtCuNHqG4G%q"';

// List of messages
const liste_messages = [];


// For the call on the REST API to get the Title value on the JSOn, we need a Authorization header with the login and the password encoded in base64
const loginAndPassword = `${login}:${password}`;
const base64EncodedString = Buffer.from(loginAndPassword).toString('base64');
const basicAuthentication = `Basic ${base64EncodedString}`;

// This function will
async function getTitle(relativePath, source) {
  try {
    const response = await axios.get(`${source}${relativePath}`, {
      // Define headers for the request
      headers: {
        'Authorization': basicAuthentication,
        'Security-Context': securityContext,
        'Accept': 'application/json'
      }
    });

    // Access `data` array in the response
    const documentData = response.data.data;

    if (documentData && documentData.length > 0) {
      const title = documentData[0]?.dataelements?.title;
      return title || null; // Return title or null if not found
    } else {
      warn('No document data found after REST API call.');
      return null;
    }

  } catch (error) {
    error('Error fetching document');
    console.error("Error fetching document:", error.response ? error.response.data : error.message);
    return null;
  }
}

// Creation of the WebSocket server

// Define WebSocket server on port 4242
const wss = new WebSocket.Server({ port: 4242 });

// Broadcast function to send messages to all connected frontends
function broadcast(data) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

// Define connection headers
const connectionHeaders = {
  "heart-beat": "50000,0",
  host: "/",
  'client-id': '3DSEpita-YKFL',
  login: login,
  passcode: password
};

// Define servers for failover
const servers = [ 
  { ssl: true, host: 'eu1-msgbus.3dexperience.3ds.com', port: 61616, connectHeaders: connectionHeaders },
  { ssl: true, host: 'eu1-msgbus-1.3dexperience.3ds.com', port: 61616, connectHeaders: connectionHeaders }
];

// Initialize stompit failover manager
const manager = new stompit.ConnectFailover(servers, {
  initialReconnectDelay: 100,
  maxReconnectDelay: 30000,
  useExponentialBackOff: true,
  maxReconnects: 30,
  randomize: false
});

// Define subscription headers
const subscribeHeaders = {
  'destination': '/topic/3dsevents.R1132102747346.3DSpace.user', // Tenant ID topic
  'activemq.subscriptionName': 'BSYGDYEHDUUE226373', // Subscription name
  'ack': 'client-individual' // Acknowledge mode
};

info('Connection to the message broker...');
// Connect to the broker
manager.connect((error, client, reconnect) => {
  if (error) {
    error('Connection error');
    console.error('Connection error:', error.message);
    return;
  }

  info('Connected to the message broker');

  // Subscribe to the topic
  client.subscribe(subscribeHeaders, (subscribeError, message) => {
    if (subscribeError) {
      console.error('Subscription error:', subscribeError.message);
      return;
    }

    // Read the message
    message.readString('utf-8', async (readError, body) => {
      if (readError) {
        error('Error reading message');
        console.error('Error reading message:', readError.message);
        return;
      }
    
      try {
        // Parse the message
        const jsonMessage = JSON.parse(body);


        // Getting the relativePath and the source from the JSON message, to be able to do the REST API call to get the Title
        const relativePath = jsonMessage?.data?.subject?.relativePath;
        const source = jsonMessage?.data?.subject?.source;

        // Get the title from the REST API
        const title = await getTitle(relativePath, source);
        
        // Add the title to the message
        if (title) {
          jsonMessage.data.subject.title = title;
        }
        
        info('Message received');
        info('Received message :');
        console.log('Received message:', JSON.stringify(jsonMessage, null, 2));


        // Add the message to the history
        liste_messages.push(jsonMessage);


        // Broadcast the event to all WebSocket clients
        broadcast(JSON.stringify(jsonMessage));
      } catch (parseError) {
        // If the message is not JSON, log it as a plain string
        warn('Received non-JSON message');
        console.log(body);
      }
    
      // Acknowledge the message
      client.ack(message);
    });
  });

  // Disconnect the client on application exit
  process.on('SIGINT', () => {
    console.log('Disconnecting from broker');
    client.disconnect();
    process.exit();
  });
});


// WebSocket server ready
wss.on('connection', (ws) => {

  const ip = ws._socket.remoteAddress;

  info(`Frontend connected to WebSocket from ${ip}`);

  info('Sending message history to the frontend');
  // Send the message history to the new client
  liste_messages.forEach((message) => {
    ws.send(JSON.stringify(message));
  });

  info('Message history sent to the frontend');
});