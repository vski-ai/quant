export type ApiKey = {
  _id?: string;
  key: string;
  name?: string;
  owner: string;
  quotas: Quota;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type Quota = {
  requestsPerSecond: number;
  requestsPerDay: number;
  totalRequests: number;
};

export type Usage = {
  requests: number;
  total: number;
  createdAt: Date;
  updatedAt: Date;
};
