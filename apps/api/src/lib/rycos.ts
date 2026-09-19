import { env } from '../config/env.js';
import { MqttRpc } from './mqttRpc.js';

/** Process-wide persistent MQTT client for RYCOS devices (fiscal, printer, SoftPOS). */
export const rycosRpc = new MqttRpc({
  host: env.RYCOS_MQTT_HOST,
  port: env.RYCOS_MQTT_PORT,
  username: env.RYCOS_MQTT_USERNAME,
  password: env.RYCOS_MQTT_PASSWORD,
  clientPrefix: 'api',
});
