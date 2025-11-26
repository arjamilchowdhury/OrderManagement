export interface OrderRecord {
  OrderNumber: string;
  SalesDocument: string;
  OrderDate: string; // MM/DD/YYYY
  BatchNumber: string;
  Year: string;
  Material: string;
  ClubName: string;
  OrderType: string;
  Status: string;
  CDD: string;
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
  USERS = 'users'
}

export const STATUS_OPTIONS = [
  'Shipped',
  'Canceled',
  'Duplicate',
  'PA',
  'Not shipped'
];