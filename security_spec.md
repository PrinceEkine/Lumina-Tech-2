# Security Specification - Lumina Tech Admin Portal

## Data Invariants
1. **User Role Integrity**: Only existing Admins can promote other users to Admin roles. Standard users cannot modify their own roles.
2. **Attendance Chronology**: A user cannot clock out without an active clock-in for the same day. Clock-in/out times must be validated against `request.time`.
3. **Task Ownership**: Only Admins or the Task Creator can assign/delete tasks. Assignees can only update the status of tasks moved to them.
4. **Chat Privacy**: Private messages are only readable/writable by the sender and recipient.
5. **Leave Review**: Only Admins or HR can approve/reject leave requests.

## The "Dirty Dozen" Payloads

### 1. Identity Spoofing (User Collection)
```json
{
  "uid": "victim_id",
  "data": { "role": "Admin" }
}
```
*Expected: PERMISSION_DENIED (Users cannot change their own role)*

### 2. Shadow Field Injection (Tasks)
```json
{
  "title": "Malicious Task",
  "assignee_id": "victim_id",
  "is_internal_system_override": true
}
```
*Expected: PERMISSION_DENIED (Strict key validation in isValidTask)*

### 3. Orphaned Attendance
```json
{
  "staff_id": "non_existent_uid",
  "date": "2026-04-24"
}
```
*Expected: PERMISSION_DENIED (Relational check for staff existence)*

### 4. Chat Sniffing
*Querying all messages where sender_id is not the current user.*
*Expected: PERMISSION_DENIED (Secure list query enforcer)*

### 5. Future Attendance
```json
{
  "clock_in": "2026-12-31T23:59:59Z"
}
```
*Expected: PERMISSION_DENIED (Temporal integrity check)*

### 6. Leave Status Poisoning
```json
{
  "status": "Approved"
}
```
*(By a regular staff member)*
*Expected: PERMISSION_DENIED (Tiered identity logic)*

### 7. Large Blob ID
*Targeting document with a 1MB string ID.*
*Expected: PERMISSION_DENIED (isValidId enforcement)*

### 8. Blog Hijacking
```json
{
  "title": "Hacked Title"
}
```
*(By a non-Admin)*
*Expected: PERMISSION_DENIED (Admin only writes for blogs)*

### 9. Notification Snooping
*Reading someone else's notifications.*
*Expected: PERMISSION_DENIED (isOwner check)*

### 10. Message Forgery
```json
{
  "sender_id": "different_id",
  "content": "I quit!"
}
```
*Expected: PERMISSION_DENIED (Identity integrity check)*

### 11. Booking Price Manipulation
```json
{
  "price": 0
}
```
*Expected: PERMISSION_DENIED (Admin only price updates)*

### 12. Recognition Self-Award
```json
{
  "staff_id": "my_id",
  "staff_name": "Me",
  "message": "I am the best"
}
```
*Expected: PERMISSION_DENIED (Logic check: recognizing_by != staff_id)*

## Test Runner (Draft)
A `firestore.rules.test.ts` will verify these boundaries.
