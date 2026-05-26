import { useCallback, useEffect, useState } from 'react'

export type SystemConfig = {
  dashboardRefreshSeconds: number
  posSummaryRefreshSeconds: number
  creditosRefreshSeconds: number
  inventarioMovimientosLimit: number
  cajaHistorialLimit: number
  pauseRefreshOnHiddenTab: boolean
}

const SYSTEM_CONFIG_KEY = 'tienda-system-config'

export const defaultSystemConfig: SystemConfig = {
  dashboardRefreshSeconds: 30,
  posSummaryRefreshSeconds: 20,
  creditosRefreshSeconds: 30,
  inventarioMovimientosLimit: 500,
  cajaHistorialLimit: 200,
  pauseRefreshOnHiddenTab: true,
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function sanitizeConfig(input: Partial<SystemConfig>): SystemConfig {
  return {
    dashboardRefreshSeconds: clamp(Number(input.dashboardRefreshSeconds ?? defaultSystemConfig.dashboardRefreshSeconds), 10, 300),
    posSummaryRefreshSeconds: clamp(Number(input.posSummaryRefreshSeconds ?? defaultSystemConfig.posSummaryRefreshSeconds), 10, 180),
    creditosRefreshSeconds: clamp(Number(input.creditosRefreshSeconds ?? defaultSystemConfig.creditosRefreshSeconds), 10, 180),
    inventarioMovimientosLimit: clamp(Number(input.inventarioMovimientosLimit ?? defaultSystemConfig.inventarioMovimientosLimit), 100, 2000),
    cajaHistorialLimit: clamp(Number(input.cajaHistorialLimit ?? defaultSystemConfig.cajaHistorialLimit), 50, 1000),
    pauseRefreshOnHiddenTab: Boolean(input.pauseRefreshOnHiddenTab ?? defaultSystemConfig.pauseRefreshOnHiddenTab),
  }
}

function getStoredConfig(): SystemConfig {
  if (typeof window === 'undefined') {
    return defaultSystemConfig
  }

  const raw = window.localStorage.getItem(SYSTEM_CONFIG_KEY)
  if (!raw) {
    return defaultSystemConfig
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SystemConfig>
    return sanitizeConfig(parsed)
  } catch {
    return defaultSystemConfig
  }
}

export function useSystemConfig() {
  const [config, setConfig] = useState<SystemConfig>(() => getStoredConfig())

  useEffect(() => {
    window.localStorage.setItem(SYSTEM_CONFIG_KEY, JSON.stringify(config))
  }, [config])

  const updateConfig = useCallback((changes: Partial<SystemConfig>) => {
    setConfig((current) => sanitizeConfig({ ...current, ...changes }))
  }, [])

  const resetConfig = useCallback(() => {
    setConfig(defaultSystemConfig)
  }, [])

  return {
    config,
    updateConfig,
    resetConfig,
  }
}
