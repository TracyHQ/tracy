import type { AgentCliEnvPrefs } from './app-config';
import type { ReasoningExecutionRequestFields } from './reasoningExecution';
export interface BaseUrlValidationResult {
    parsed?: ParsedBaseUrl;
    error?: string;
    forbidden?: boolean;
    resolvedAddresses?: ReadonlyArray<{
        address: string;
        family: number;
    }>;
}
export interface ParsedBaseUrl {
    protocol: string;
    hostname: string;
    toString(): string;
}
export declare function isLoopbackApiHost(hostname: string): boolean;
export declare function isBlockedExternalApiHostname(hostname: string): boolean;
export declare function isAllowlistedInternalHost(hostname: string, allowedInternalHosts?: readonly string[]): boolean;
export interface ValidateBaseUrlOptions {
    allowedInternalHosts?: readonly string[];
    forbidLoopback?: boolean;
}
export declare function validateBaseUrl(baseUrl: string, options?: ValidateBaseUrlOptions): BaseUrlValidationResult;
export type ConnectionTestKind = 'success' | 'auth_failed' | 'forbidden' | 'not_found_model' | 'invalid_model_id' | 'invalid_base_url' | 'rate_limited' | 'upstream_unavailable' | 'timeout' | 'agent_not_installed' | 'agent_auth_required' | 'agent_spawn_failed' | 'unknown';
export type ConnectionTestPhase = 'binary_resolution' | 'version_probe' | 'model_list' | 'spawn' | 'connection_smoke_test' | 'output_parse';
export interface ConnectionTestDiagnostics {
    phase: ConnectionTestPhase;
    binaryPath?: string;
    binaryVersion?: string | null;
    exitCode?: number | null;
    signal?: string | null;
    stdoutTail?: string;
    stderrTail?: string;
}
export type ConnectionTestProtocol = 'anthropic' | 'openai' | 'azure' | 'google' | 'ollama' | 'senseaudio' | 'aihubmix' | 'bedrock';
export interface ProviderTestRequest extends ReasoningExecutionRequestFields {
    protocol: ConnectionTestProtocol;
    baseUrl: string;
    apiKey: string;
    model: string;
    apiVersion?: string;
}
export interface AgentTestRequest {
    agentId: string;
    model?: string;
    reasoning?: string;
    serviceTier?: string;
    agentCliEnv?: AgentCliEnvPrefs;
}
export type ConnectionTestRequest = ({
    mode: 'provider';
} & ProviderTestRequest) | ({
    mode: 'agent';
} & AgentTestRequest);
export interface ConnectionTestResponse {
    ok: boolean;
    kind: ConnectionTestKind;
    latencyMs: number;
    model?: string;
    resolvedModel?: string;
    sample?: string;
    status?: number;
    agentName?: string;
    detail?: string;
    configuredExecutablePath?: string;
    detectedExecutablePath?: string;
    usedExecutablePath?: string;
    usedExecutableSource?: 'configured' | 'path' | 'fallback_invalid' | 'fallback_failed';
    diagnostics?: ConnectionTestDiagnostics;
}
