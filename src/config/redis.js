const { createClient } = require("redis");

const env = require("./env");

let redisClient;
let redisStatus = "down";

async function connectRedis() {
  if (!env.redisUrl) {
    redisStatus = "down";
    console.error("[Redis] REDIS_URL missing, continuing without Redis");
    return null;
  }

  if (redisClient?.isOpen) {
    return redisClient;
  }

  const client = createClient({
    url: env.redisUrl,
    socket: {
      reconnectStrategy: false,
    },
  });

  client.on("error", (error) => {
    redisStatus = "down";
    console.error("[Redis] unavailable", error.message);
  });

  try {
    await client.connect();
    redisClient = client;
    redisStatus = "up";
    console.log("[Redis] connected");
    return redisClient;
  } catch (error) {
    redisStatus = "down";
    console.error("[Redis] unavailable", error.message);
    redisClient = null;
    return null;
  }
}

function getRedisClient() {
  return redisClient?.isOpen ? redisClient : null;
}

function getRedisStatus() {
  return redisStatus;
}

async function pingRedis() {
  const client = getRedisClient();

  if (!client) {
    return false;
  }

  try {
    return (await client.ping()) === "PONG";
  } catch (error) {
    redisStatus = "down";
    console.error("[Redis] health check failed", error.message);
    return false;
  }
}

async function closeRedis() {
  if (!redisClient) {
    return;
  }

  if (redisClient.isOpen) {
    await redisClient.quit().catch(async () => {
      redisClient.disconnect();
    });
  }

  redisClient = null;
  redisStatus = "down";
}

module.exports = {
  connectRedis,
  getRedisClient,
  pingRedis,
  closeRedis,
};
