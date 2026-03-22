import {
  RUNTIME_CORE_IDENTITY,
} from './runtime-identity.generated.js';

export interface RuntimeCoreIdentity {
  packageName: string;
  version: string;
  buildId?: string;
  resolvedFrom?: string;
}

export function getRuntimeCoreIdentity(): RuntimeCoreIdentity {
  return {
    ...RUNTIME_CORE_IDENTITY,
  };
}
