export interface GlobalConfig {
  kafkaHost: string;
  ssl?: boolean;
  sslOptions?: {
    requestCert?: boolean;
    rejectUnauthorized?: boolean;
  };
  sasl?: {
    mechanism: string;
    username: string;
    password: string;
  };
}
