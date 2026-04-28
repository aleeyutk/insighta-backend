# Profile Intelligence Service

## Overview
A Profile Intelligence Service that accepts a name, enriches it using multiple external APIs (Genderize, Agify, Nationalize), stores the combined result in a SQLite database, and returns clean, consistent JSON responses. This system includes features for retrieving historical profile inputs and managing data efficiently.

## Prerequisites
- Node.js (v18 or higher)
- npm

## Setup
1. Clone or navigate into the directory containing this project (`stage-1`).
2. Install the application dependencies:
   ```bash
   npm install
   ```
3. Start the server (defaults to port `3000`):
   ```bash
   node index.js
   ```

## API Endpoints

### 1. Create a Profile
- **Method:** `POST`
- **Path:** `/api/profiles`
- **Body:** `{ "name": "ella" }`
- **Description:** Enriches a name using external APIs and persists it to the database. It handles idempotency: submitting the exact same name repeatedly will safely return the original stored data without initiating new external API queries.

### 2. Retrieve a Profile by ID
- **Method:** `GET`
- **Path:** `/api/profiles/:id`
- **Description:** Retrieves the details of a processed profile using its `id` (UUID v7 format).

### 3. Retrieve Multiple Profiles
- **Method:** `GET`
- **Path:** `/api/profiles`
- **Query Parameters (optional):** `gender`, `country_id`, `age_group`. (Query strings are case-insensitive).
- **Description:** Returns an array of stored profiles based on supplied filtering criteria. Output representation limits exposed database variables (such as sample sizes and probabilities).

### 4. Delete a Profile
- **Method:** `DELETE`
- **Path:** `/api/profiles/:id`
- **Description:** Deletes a stored profile by its ID. Returns a `204 No Content` code on success.

## Error Handling
All APIs follow a clean error response structure:
```json
{
  "status": "error",
  "message": "Specific error message here"
}
```
Failed downstream dependencies or omitted values within APIs (like Agify, Genderize, Nationalize) yield an explicit HTTP `502` code indicating upstream limitations or misbehavior.
