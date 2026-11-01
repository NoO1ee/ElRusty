export interface RustTimeInfo {
  time: number;
  sunrise: number;
  sunset: number;
  dayLengthMinutes: number;
  timeScale: number;
}
export interface TimeCalibration {
  reference: RustTimeInfo;
  day: number[][];
  night: number[][];
}
export interface SavedTimeCalibration {
  wipeKey: string;
  calibration: TimeCalibration;
}
