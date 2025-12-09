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

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: 'admin' | 'view';
}

export enum AppRoute {
  RECONCILIATION = 'reconciliation',
  CLUB_ORDER = 'club-order',
  GOOD_RECEIVE = 'good-receive',
  ORDER_CLOSING = 'order-closing',
  USERS = 'users',
  EDIT_ORDER = 'edit-order'
}

export const STATUS_OPTIONS = [
  'Shipped',
  'Canceled',
  'Duplicate',
  'PA',
  'Not shipped'
];