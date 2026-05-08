export type UpdateInfo = {
  latestVersion: string
  currentVersion: string
  releaseNotes: string
  downloadUrl: string
  htmlUrl: string
  checkedAt: string
  dismissed: boolean
}

const STORAGE_KEY = 'request-forwarder.update'

const getCurrentVersion = (): string => {
  try {
    return chrome.runtime.getManifest().version
  } catch {
    return '0.0.0'
  }
}

export const checkForUpdate = async (): Promise<UpdateInfo | null> => {
  try {
    const response = await fetch(
      'https://api.github.com/repos/fong-hub/web-request-forwarder/releases/latest',
      { headers: { Accept: 'application/vnd.github+json' } },
    )

    if (!response.ok) {
      return null
    }

    const data = await response.json() as {
      tag_name: string
      body: string
      html_url: string
      assets: { browser_download_url: string; name: string }[]
    }

    const latestVersion = data.tag_name.replace(/^v/, '')
    const currentVersion = getCurrentVersion()

    if (latestVersion === currentVersion) {
      return null
    }

    const zipAsset = data.assets.find((asset) => asset.name.endsWith('.zip'))

    return {
      latestVersion,
      currentVersion,
      releaseNotes: data.body ?? '',
      downloadUrl: zipAsset?.browser_download_url ?? data.html_url,
      htmlUrl: data.html_url,
      checkedAt: new Date().toISOString(),
      dismissed: false,
    }
  } catch {
    return null
  }
}

export const getUpdateInfo = (): Promise<UpdateInfo | null> => {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    return chrome.storage.local.get(STORAGE_KEY).then((result) => {
      const value = result[STORAGE_KEY]
      return isUpdateInfo(value) ? value : null
    })
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : null
    return Promise.resolve(isUpdateInfo(parsed) ? parsed : null)
  } catch {
    return Promise.resolve(null)
  }
}

export const saveUpdateInfo = async (info: UpdateInfo | null) => {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ [STORAGE_KEY]: info })
    return
  }

  if (info) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(info))
  } else {
    localStorage.removeItem(STORAGE_KEY)
  }
}

export const dismissUpdate = async () => {
  const info = await getUpdateInfo()
  if (info) {
    await saveUpdateInfo({ ...info, dismissed: true })
  }
}

const isUpdateInfo = (value: unknown): value is UpdateInfo => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.latestVersion === 'string' &&
    typeof candidate.currentVersion === 'string' &&
    typeof candidate.releaseNotes === 'string' &&
    typeof candidate.downloadUrl === 'string' &&
    typeof candidate.htmlUrl === 'string' &&
    typeof candidate.checkedAt === 'string' &&
    typeof candidate.dismissed === 'boolean'
  )
}
