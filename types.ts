
export interface OrderRecord {
  OrderNumber: string | number;
  SalesDocument: string | number;
  OrderDate: string; // MM/DD/YYYY or YYYY-MM-DD
  BatchNumber: string;
  Year: string | number;
  "Material Number": string; // Note: Key has a space in Firebase data
  ClubName: string;
  OrderType: string;
  Status: string;
  CDD: string | number;
  UPSTrackingNumber: string;
  Code: string; // Unique Key
  [key: string]: any; // Allow loose fields for parsing
}

export interface User {
  uid: string;
  email: string | null;
  displayName?: string | null;
}

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: 'admin' | 'view';
}

export enum AppRoute {
  RECONCILIATION = 'reconciliation',
  CLUB_ORDER = 'club-order',
  SHIPMENT = 'shipment',
  GOOD_RECEIVE = 'good-receive',
  ORDER_CLOSING = 'order-closing',
  EXTRACTOR = 'extractor',
  USERS = 'users',
  EDIT_ORDER = 'edit-order',
  USER_PROFILE = 'user-profile'
}

export const STATUS_OPTIONS = [
  'Shipped',
  'Canceled',
  'Duplicate',
  'PA',
  'Not shipped'
];

export type ClubFileStatus = 'File preparing' | 'Packing list checking' | 'Correction' | 'Share';

export const CLUB_FILE_STATUSES: ClubFileStatus[] = [
  'File preparing', 
  'Packing list checking', 
  'Correction', 
  'Share'
];

// Normalized Row for Club Order Page
export interface ClubOrderRow {
  orderId: string;
  salesDoc: string;
  orderDate: string;
  qty: number;
  sku: string;
  material: string;
  productName: string;
  clubName: string;
  raw: any;
}

export type ClubCategory = 'RUSH_RS' | 'RUSH_RSA' | 'RUSH_MIAMI' | 'REPLACEMENT' | 'MULTIPLE_CLUBS' | 'MULTI_SPORT' | 'OTHER';

export interface ProcessedFile {
  id: string;
  name: string;
  category: ClubCategory;
  rows: ClubOrderRow[];
  totalOrders: number; // Unique Order IDs in this file
  totalQty: number;
  orderDate: string; // Most frequent or earliest
  status: ClubFileStatus;
  assignee: string;
  uploadTimestamp: number;
}
