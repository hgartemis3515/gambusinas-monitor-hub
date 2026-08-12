export const IpcChannel = {
  MONITORS_LIST: 'monitors:list',
  MONITORS_IDENTIFY: 'monitors:identify',
  WINDOWS_LIST: 'windows:list',
  WINDOWS_THUMBNAILS: 'windows:thumbnails',
  WINDOW_MOVE: 'window:move',
  WINDOW_SET_MODE: 'window:setMode',
  LAYOUTS_LIST: 'layouts:list',
  LAYOUTS_SAVE: 'layouts:save',
  LAYOUTS_APPLY: 'layouts:apply',
  LAYOUTS_DELETE: 'layouts:delete',
  COCINA_IMPORT: 'cocina:import',
  COCINA_IMPORT_FILE: 'cocina:importFile',
} as const;

export type IpcChannelName = (typeof IpcChannel)[keyof typeof IpcChannel];
