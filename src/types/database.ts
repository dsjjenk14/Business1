
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "app_config": {
                  Row: {
                    "description": string,"key": string,"value": NonNullable<Json>
                  }
                  Insert: {
                    "description"?: string,"key": string,"value": NonNullable<Json>
                  }
                  Update: {
                    "description"?: string,"key"?: string,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"blocks": {
                  Row: {
                    "blocked_id": string,"blocker_id": string,"created_at": string
                  }
                  Insert: {
                    "blocked_id": string,"blocker_id": string,"created_at"?: string
                  }
                  Update: {
                    "blocked_id"?: string,"blocker_id"?: string,"created_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "blocks_blocked_id_fkey"
      columns: ["blocked_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "blocks_blocker_id_fkey"
      columns: ["blocker_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"cities": {
                  Row: {
                    "active": boolean,"center": unknown,"id": number,"metro": string,"name": string,"region": string,"slug": string,"sort": number
                  }
                  Insert: {
                    "active"?: boolean,"center": unknown,"id"?: number,"metro"?: string,"name": string,"region": string,"slug": string,"sort"?: number
                  }
                  Update: {
                    "active"?: boolean,"center"?: unknown,"id"?: number,"metro"?: string,"name"?: string,"region"?: string,"slug"?: string,"sort"?: number
                  }
                  Relationships: [
                    
                  ]
                },"connections": {
                  Row: {
                    "connector_id": string | null,"created_at": string,"source": Database["public"]['Enums']["connection_source"],"user_a": string,"user_b": string
                  }
                  Insert: {
                    "connector_id"?: string | null,"created_at"?: string,"source": Database["public"]['Enums']["connection_source"],"user_a": string,"user_b": string
                  }
                  Update: {
                    "connector_id"?: string | null,"created_at"?: string,"source"?: Database["public"]['Enums']["connection_source"],"user_a"?: string,"user_b"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "connections_connector_id_fkey"
      columns: ["connector_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "connections_user_a_fkey"
      columns: ["user_a"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "connections_user_b_fkey"
      columns: ["user_b"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"conversation_members": {
                  Row: {
                    "conversation_id": number,"last_read_at": string | null,"user_id": string
                  }
                  Insert: {
                    "conversation_id": number,"last_read_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "conversation_id"?: number,"last_read_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversation_members_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversation_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"conversations": {
                  Row: {
                    "created_at": string,"direct_a": string | null,"direct_b": string | null,"group_id": number | null,"id": number,"kind": string,"last_message_at": string | null
                  }
                  Insert: {
                    "created_at"?: string,"direct_a"?: string | null,"direct_b"?: string | null,"group_id"?: number | null,"id"?: number,"kind": string,"last_message_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"direct_a"?: string | null,"direct_b"?: string | null,"group_id"?: number | null,"id"?: number,"kind"?: string,"last_message_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversations_direct_a_fkey"
      columns: ["direct_a"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversations_direct_b_fkey"
      columns: ["direct_b"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversations_group_id_fkey"
      columns: ["group_id"]
isOneToOne: true
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"encounters": {
                  Row: {
                    "context": Database["public"]['Enums']["encounter_context"],"created_at": string,"distance_m": number,"event_id": number | null,"id": number,"overlap_end": string,"overlap_start": string,"place_label": string | null,"user_a": string,"user_b": string,"venue_id": number | null
                  }
                  Insert: {
                    "context": Database["public"]['Enums']["encounter_context"],"created_at"?: string,"distance_m": number,"event_id"?: number | null,"id"?: number,"overlap_end": string,"overlap_start": string,"place_label"?: string | null,"user_a": string,"user_b": string,"venue_id"?: number | null
                  }
                  Update: {
                    "context"?: Database["public"]['Enums']["encounter_context"],"created_at"?: string,"distance_m"?: number,"event_id"?: number | null,"id"?: number,"overlap_end"?: string,"overlap_start"?: string,"place_label"?: string | null,"user_a"?: string,"user_b"?: string,"venue_id"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "encounters_event_fk"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "encounters_user_a_fkey"
      columns: ["user_a"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "encounters_user_b_fkey"
      columns: ["user_b"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "encounters_venue_fk"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"entitlements": {
                  Row: {
                    "premium_until": string | null,"source": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "premium_until"?: string | null,"source"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "premium_until"?: string | null,"source"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "entitlements_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"event_rsvps": {
                  Row: {
                    "created_at": string,"event_id": number,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"event_id": number,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"event_id"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_rsvps_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_rsvps_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"events": {
                  Row: {
                    "capacity": number | null,"created_at": string,"description": string,"emoji": string | null,"ends_at": string | null,"group_id": number | null,"host_id": string,"id": number,"is_recurring": boolean,"starts_at": string,"title": string,"venue_id": number | null
                  }
                  Insert: {
                    "capacity"?: number | null,"created_at"?: string,"description"?: string,"emoji"?: string | null,"ends_at"?: string | null,"group_id"?: number | null,"host_id": string,"id"?: number,"is_recurring"?: boolean,"starts_at": string,"title": string,"venue_id"?: number | null
                  }
                  Update: {
                    "capacity"?: number | null,"created_at"?: string,"description"?: string,"emoji"?: string | null,"ends_at"?: string | null,"group_id"?: number | null,"host_id"?: string,"id"?: number,"is_recurring"?: boolean,"starts_at"?: string,"title"?: string,"venue_id"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_host_id_fkey"
      columns: ["host_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"going_out_posts": {
                  Row: {
                    "approx_location": unknown,"created_at": string,"event_id": number | null,"expires_at": string,"id": number,"is_hosting": boolean,"is_priority": boolean,"note": string | null,"place_text": string | null,"starts_at": string,"user_id": string,"venue_id": number | null,"vibes": (string)[],"when_kind": Database["public"]['Enums']["going_out_when"]
                  }
                  Insert: {
                    "approx_location"?: unknown,"created_at"?: string,"event_id"?: number | null,"expires_at": string,"id"?: number,"is_hosting"?: boolean,"is_priority"?: boolean,"note"?: string | null,"place_text"?: string | null,"starts_at": string,"user_id": string,"venue_id"?: number | null,"vibes"?: (string)[],"when_kind": Database["public"]['Enums']["going_out_when"]
                  }
                  Update: {
                    "approx_location"?: unknown,"created_at"?: string,"event_id"?: number | null,"expires_at"?: string,"id"?: number,"is_hosting"?: boolean,"is_priority"?: boolean,"note"?: string | null,"place_text"?: string | null,"starts_at"?: string,"user_id"?: string,"venue_id"?: number | null,"vibes"?: (string)[],"when_kind"?: Database["public"]['Enums']["going_out_when"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "going_out_posts_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "going_out_posts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "going_out_posts_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"group_join_requests": {
                  Row: {
                    "created_at": string,"group_id": number,"how_found": string | null,"id": number,"reviewed_by": string | null,"status": Database["public"]['Enums']["request_status"],"user_id": string,"why": string
                  }
                  Insert: {
                    "created_at"?: string,"group_id": number,"how_found"?: string | null,"id"?: number,"reviewed_by"?: string | null,"status"?: Database["public"]['Enums']["request_status"],"user_id": string,"why"?: string
                  }
                  Update: {
                    "created_at"?: string,"group_id"?: number,"how_found"?: string | null,"id"?: number,"reviewed_by"?: string | null,"status"?: Database["public"]['Enums']["request_status"],"user_id"?: string,"why"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "group_join_requests_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_join_requests_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_join_requests_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"group_members": {
                  Row: {
                    "group_id": number,"joined_at": string,"role": Database["public"]['Enums']["group_role"],"user_id": string
                  }
                  Insert: {
                    "group_id": number,"joined_at"?: string,"role"?: Database["public"]['Enums']["group_role"],"user_id": string
                  }
                  Update: {
                    "group_id"?: number,"joined_at"?: string,"role"?: Database["public"]['Enums']["group_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "group_members_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"groups": {
                  Row: {
                    "category": string,"city_id": number | null,"created_at": string,"description": string,"emoji": string,"id": number,"join_type": Database["public"]['Enums']["join_type"],"name": string,"owner_id": string,"schedule_label": string | null
                  }
                  Insert: {
                    "category": string,"city_id"?: number | null,"created_at"?: string,"description"?: string,"emoji"?: string,"id"?: number,"join_type"?: Database["public"]['Enums']["join_type"],"name": string,"owner_id": string,"schedule_label"?: string | null
                  }
                  Update: {
                    "category"?: string,"city_id"?: number | null,"created_at"?: string,"description"?: string,"emoji"?: string,"id"?: number,"join_type"?: Database["public"]['Enums']["join_type"],"name"?: string,"owner_id"?: string,"schedule_label"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "groups_city_id_fkey"
      columns: ["city_id"]
isOneToOne: false
      referencedRelation: "cities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "groups_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"interactions": {
                  Row: {
                    "exchanges": number,"last_sender": string | null,"turns": number,"updated_at": string,"user_a": string,"user_b": string
                  }
                  Insert: {
                    "exchanges"?: number,"last_sender"?: string | null,"turns"?: number,"updated_at"?: string,"user_a": string,"user_b": string
                  }
                  Update: {
                    "exchanges"?: number,"last_sender"?: string | null,"turns"?: number,"updated_at"?: string,"user_a"?: string,"user_b"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "interactions_user_a_fkey"
      columns: ["user_a"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "interactions_user_b_fkey"
      columns: ["user_b"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"intro_requests": {
                  Row: {
                    "created_at": string,"id": number,"intro_id": number | null,"note": string | null,"requester_id": string,"status": Database["public"]['Enums']["request_status"],"target_id": string,"via_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: number,"intro_id"?: number | null,"note"?: string | null,"requester_id": string,"status"?: Database["public"]['Enums']["request_status"],"target_id": string,"via_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: number,"intro_id"?: number | null,"note"?: string | null,"requester_id"?: string,"status"?: Database["public"]['Enums']["request_status"],"target_id"?: string,"via_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "intro_requests_intro_id_fkey"
      columns: ["intro_id"]
isOneToOne: false
      referencedRelation: "intros"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "intro_requests_requester_id_fkey"
      columns: ["requester_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "intro_requests_target_id_fkey"
      columns: ["target_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "intro_requests_via_id_fkey"
      columns: ["via_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"intros": {
                  Row: {
                    "a_status": Database["public"]['Enums']["intro_status"],"b_status": Database["public"]['Enums']["intro_status"],"connector_id": string,"created_at": string,"id": number,"message": string,"person_a": string,"person_b": string,"predicted_score": number | null
                  }
                  Insert: {
                    "a_status"?: Database["public"]['Enums']["intro_status"],"b_status"?: Database["public"]['Enums']["intro_status"],"connector_id": string,"created_at"?: string,"id"?: number,"message": string,"person_a": string,"person_b": string,"predicted_score"?: number | null
                  }
                  Update: {
                    "a_status"?: Database["public"]['Enums']["intro_status"],"b_status"?: Database["public"]['Enums']["intro_status"],"connector_id"?: string,"created_at"?: string,"id"?: number,"message"?: string,"person_a"?: string,"person_b"?: string,"predicted_score"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "intros_connector_id_fkey"
      columns: ["connector_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "intros_person_a_fkey"
      columns: ["person_a"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "intros_person_b_fkey"
      columns: ["person_b"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"location_pings": {
                  Row: {
                    "accuracy_m": number | null,"event_id": number | null,"id": number,"location": unknown,"purpose": string,"recorded_at": string,"user_id": string,"venue_id": number | null
                  }
                  Insert: {
                    "accuracy_m"?: number | null,"event_id"?: number | null,"id"?: number,"location": unknown,"purpose": string,"recorded_at"?: string,"user_id": string,"venue_id"?: number | null
                  }
                  Update: {
                    "accuracy_m"?: number | null,"event_id"?: number | null,"id"?: number,"location"?: unknown,"purpose"?: string,"recorded_at"?: string,"user_id"?: string,"venue_id"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "location_pings_event_fk"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "location_pings_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "location_pings_venue_fk"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"login_attempts": {
                  Row: {
                    "attempted_at": string,"id": number,"phone": string,"succeeded": boolean
                  }
                  Insert: {
                    "attempted_at"?: string,"id"?: number,"phone": string,"succeeded": boolean
                  }
                  Update: {
                    "attempted_at"?: string,"id"?: number,"phone"?: string,"succeeded"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"messages": {
                  Row: {
                    "body": string,"char_length": number | null,"conversation_id": number,"created_at": string,"id": number,"reply_seconds": number | null,"sender_id": string
                  }
                  Insert: {
                    "body": string,"char_length"?: never,"conversation_id": number,"created_at"?: string,"id"?: number,"reply_seconds"?: number | null,"sender_id": string
                  }
                  Update: {
                    "body"?: string,"char_length"?: never,"conversation_id"?: number,"created_at"?: string,"id"?: number,"reply_seconds"?: number | null,"sender_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "actor_id": string | null,"body": string,"created_at": string,"id": number,"is_ai": boolean,"kind": string,"link": string | null,"read_at": string | null,"title": string,"user_id": string
                  }
                  Insert: {
                    "actor_id"?: string | null,"body"?: string,"created_at"?: string,"id"?: number,"is_ai"?: boolean,"kind": string,"link"?: string | null,"read_at"?: string | null,"title": string,"user_id": string
                  }
                  Update: {
                    "actor_id"?: string | null,"body"?: string,"created_at"?: string,"id"?: number,"is_ai"?: boolean,"kind"?: string,"link"?: string | null,"read_at"?: string | null,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"phone_verifications": {
                  Row: {
                    "attempts": number,"code_hash": string,"created_at": string,"expires_at": string,"id": number,"phone": string,"user_id": string,"verified_at": string | null
                  }
                  Insert: {
                    "attempts"?: number,"code_hash": string,"created_at"?: string,"expires_at": string,"id"?: number,"phone": string,"user_id": string,"verified_at"?: string | null
                  }
                  Update: {
                    "attempts"?: number,"code_hash"?: string,"created_at"?: string,"expires_at"?: string,"id"?: number,"phone"?: string,"user_id"?: string,"verified_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "phone_verifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"pin_bookmarks": {
                  Row: {
                    "created_at": string,"pin_id": number,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"pin_id": number,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"pin_id"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pin_bookmarks_pin_id_fkey"
      columns: ["pin_id"]
isOneToOne: false
      referencedRelation: "pins"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pin_bookmarks_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"pin_likes": {
                  Row: {
                    "created_at": string,"pin_id": number,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"pin_id": number,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"pin_id"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pin_likes_pin_id_fkey"
      columns: ["pin_id"]
isOneToOne: false
      referencedRelation: "pins"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pin_likes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"pin_photos": {
                  Row: {
                    "id": number,"pin_id": number,"position": number,"storage_path": string
                  }
                  Insert: {
                    "id"?: number,"pin_id": number,"position": number,"storage_path": string
                  }
                  Update: {
                    "id"?: number,"pin_id"?: number,"position"?: number,"storage_path"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pin_photos_pin_id_fkey"
      columns: ["pin_id"]
isOneToOne: false
      referencedRelation: "pins"
      referencedColumns: ["id"]
    }
                  ]
                },"pin_replies": {
                  Row: {
                    "author_id": string,"body": string,"created_at": string,"deleted_at": string | null,"id": number,"pin_id": number
                  }
                  Insert: {
                    "author_id": string,"body": string,"created_at"?: string,"deleted_at"?: string | null,"id"?: number,"pin_id": number
                  }
                  Update: {
                    "author_id"?: string,"body"?: string,"created_at"?: string,"deleted_at"?: string | null,"id"?: number,"pin_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "pin_replies_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pin_replies_pin_id_fkey"
      columns: ["pin_id"]
isOneToOne: false
      referencedRelation: "pins"
      referencedColumns: ["id"]
    }
                  ]
                },"pin_tags": {
                  Row: {
                    "pin_id": number,"user_id": string
                  }
                  Insert: {
                    "pin_id": number,"user_id": string
                  }
                  Update: {
                    "pin_id"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pin_tags_pin_id_fkey"
      columns: ["pin_id"]
isOneToOne: false
      referencedRelation: "pins"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pin_tags_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"pins": {
                  Row: {
                    "approx_location": unknown,"audience": Database["public"]['Enums']["pin_audience"],"author_id": string,"body": string,"category": Database["public"]['Enums']["pin_category"],"city_id": number | null,"created_at": string,"deleted_at": string | null,"edited_at": string | null,"event_id": number | null,"going_out_post_id": number | null,"id": number,"like_count": number,"place_label": string | null,"reply_count": number,"venue_id": number | null
                  }
                  Insert: {
                    "approx_location"?: unknown,"audience"?: Database["public"]['Enums']["pin_audience"],"author_id": string,"body": string,"category": Database["public"]['Enums']["pin_category"],"city_id"?: number | null,"created_at"?: string,"deleted_at"?: string | null,"edited_at"?: string | null,"event_id"?: number | null,"going_out_post_id"?: number | null,"id"?: number,"like_count"?: number,"place_label"?: string | null,"reply_count"?: number,"venue_id"?: number | null
                  }
                  Update: {
                    "approx_location"?: unknown,"audience"?: Database["public"]['Enums']["pin_audience"],"author_id"?: string,"body"?: string,"category"?: Database["public"]['Enums']["pin_category"],"city_id"?: number | null,"created_at"?: string,"deleted_at"?: string | null,"edited_at"?: string | null,"event_id"?: number | null,"going_out_post_id"?: number | null,"id"?: number,"like_count"?: number,"place_label"?: string | null,"reply_count"?: number,"venue_id"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "pins_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pins_city_id_fkey"
      columns: ["city_id"]
isOneToOne: false
      referencedRelation: "cities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pins_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pins_going_out_post_id_fkey"
      columns: ["going_out_post_id"]
isOneToOne: false
      referencedRelation: "going_out_posts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pins_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"plan_limits": {
                  Row: {
                    "description": string,"free_value": number | null,"key": string,"premium_value": number | null
                  }
                  Insert: {
                    "description"?: string,"free_value"?: number | null,"key": string,"premium_value"?: number | null
                  }
                  Update: {
                    "description"?: string,"free_value"?: number | null,"key"?: string,"premium_value"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"profile_private": {
                  Row: {
                    "ai_chat_opt_in": boolean,"birthdate": string,"created_at": string,"email": string | null,"id": string,"onboarding_checklist_dismissed_at": string | null,"phone": string | null,"phone_verified_at": string | null
                  }
                  Insert: {
                    "ai_chat_opt_in"?: boolean,"birthdate": string,"created_at"?: string,"email"?: string | null,"id": string,"onboarding_checklist_dismissed_at"?: string | null,"phone"?: string | null,"phone_verified_at"?: string | null
                  }
                  Update: {
                    "ai_chat_opt_in"?: boolean,"birthdate"?: string,"created_at"?: string,"email"?: string | null,"id"?: string,"onboarding_checklist_dismissed_at"?: string | null,"phone"?: string | null,"phone_verified_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "profile_private_id_fkey"
      columns: ["id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "accent_color": string | null,"approx_location": unknown,"avatar_emoji": string | null,"avatar_url": string | null,"bg_pattern": string | null,"bio": string,"city_id": number | null,"created_at": string,"display_name": string,"full_name": string,"headline": string,"id": string,"id_verified_at": string | null,"invite_code": string,"invited_by": string | null,"is_founding_member": boolean,"location_precision": Database["public"]['Enums']["location_precision"],"member_number": number,"mood_status": string | null,"neighborhood": string | null,"photo_verified_at": string | null,"pronouns": string | null,"role": Database["public"]['Enums']["user_role"],"show_age": boolean,"song_url": string | null,"top_vouch_word": string | null,"updated_at": string,"vouch_count": number
                  }
                  Insert: {
                    "accent_color"?: string | null,"approx_location"?: unknown,"avatar_emoji"?: string | null,"avatar_url"?: string | null,"bg_pattern"?: string | null,"bio"?: string,"city_id"?: number | null,"created_at"?: string,"display_name": string,"full_name": string,"headline"?: string,"id": string,"id_verified_at"?: string | null,"invite_code": string,"invited_by"?: string | null,"is_founding_member"?: boolean,"location_precision"?: Database["public"]['Enums']["location_precision"],"member_number"?: number,"mood_status"?: string | null,"neighborhood"?: string | null,"photo_verified_at"?: string | null,"pronouns"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"show_age"?: boolean,"song_url"?: string | null,"top_vouch_word"?: string | null,"updated_at"?: string,"vouch_count"?: number
                  }
                  Update: {
                    "accent_color"?: string | null,"approx_location"?: unknown,"avatar_emoji"?: string | null,"avatar_url"?: string | null,"bg_pattern"?: string | null,"bio"?: string,"city_id"?: number | null,"created_at"?: string,"display_name"?: string,"full_name"?: string,"headline"?: string,"id"?: string,"id_verified_at"?: string | null,"invite_code"?: string,"invited_by"?: string | null,"is_founding_member"?: boolean,"location_precision"?: Database["public"]['Enums']["location_precision"],"member_number"?: number,"mood_status"?: string | null,"neighborhood"?: string | null,"photo_verified_at"?: string | null,"pronouns"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"show_age"?: boolean,"song_url"?: string | null,"top_vouch_word"?: string | null,"updated_at"?: string,"vouch_count"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_city_id_fkey"
      columns: ["city_id"]
isOneToOne: false
      referencedRelation: "cities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profiles_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"push_tokens": {
                  Row: {
                    "platform": string,"token": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "platform": string,"token": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "platform"?: string,"token"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_tokens_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"top_friends": {
                  Row: {
                    "friend_id": string,"position": number,"user_id": string
                  }
                  Insert: {
                    "friend_id": string,"position": number,"user_id": string
                  }
                  Update: {
                    "friend_id"?: string,"position"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "top_friends_friend_id_fkey"
      columns: ["friend_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "top_friends_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"user_settings": {
                  Row: {
                    "allow_intro_requests": boolean,"discoverable": boolean,"notify_date_requests": boolean,"notify_gps_vouch": boolean,"notify_intro_requests": boolean,"notify_messages": boolean,"notify_pin_replies": boolean,"notify_rsvps": boolean,"radius_mi": number,"show_going_out_venue": boolean,"show_in_nearby": boolean,"show_vouch_count": boolean,"theme_id": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "allow_intro_requests"?: boolean,"discoverable"?: boolean,"notify_date_requests"?: boolean,"notify_gps_vouch"?: boolean,"notify_intro_requests"?: boolean,"notify_messages"?: boolean,"notify_pin_replies"?: boolean,"notify_rsvps"?: boolean,"radius_mi"?: number,"show_going_out_venue"?: boolean,"show_in_nearby"?: boolean,"show_vouch_count"?: boolean,"theme_id"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "allow_intro_requests"?: boolean,"discoverable"?: boolean,"notify_date_requests"?: boolean,"notify_gps_vouch"?: boolean,"notify_intro_requests"?: boolean,"notify_messages"?: boolean,"notify_pin_replies"?: boolean,"notify_rsvps"?: boolean,"radius_mi"?: number,"show_going_out_venue"?: boolean,"show_in_nearby"?: boolean,"show_vouch_count"?: boolean,"theme_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_settings_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"venues": {
                  Row: {
                    "address": string | null,"category": string | null,"city_id": number | null,"created_at": string,"description": string,"emoji": string | null,"id": number,"location": unknown,"name": string,"neighborhood": string | null,"price_level": number | null
                  }
                  Insert: {
                    "address"?: string | null,"category"?: string | null,"city_id"?: number | null,"created_at"?: string,"description"?: string,"emoji"?: string | null,"id"?: number,"location": unknown,"name": string,"neighborhood"?: string | null,"price_level"?: number | null
                  }
                  Update: {
                    "address"?: string | null,"category"?: string | null,"city_id"?: number | null,"created_at"?: string,"description"?: string,"emoji"?: string | null,"id"?: number,"location"?: unknown,"name"?: string,"neighborhood"?: string | null,"price_level"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "venues_city_id_fkey"
      columns: ["city_id"]
isOneToOne: false
      referencedRelation: "cities"
      referencedColumns: ["id"]
    }
                  ]
                },"vouch_requests": {
                  Row: {
                    "created_at": string,"encounter_id": number | null,"id": number,"requester_id": string,"status": Database["public"]['Enums']["request_status"],"target_id": string
                  }
                  Insert: {
                    "created_at"?: string,"encounter_id"?: number | null,"id"?: number,"requester_id": string,"status"?: Database["public"]['Enums']["request_status"],"target_id": string
                  }
                  Update: {
                    "created_at"?: string,"encounter_id"?: number | null,"id"?: number,"requester_id"?: string,"status"?: Database["public"]['Enums']["request_status"],"target_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "vouch_requests_encounter_id_fkey"
      columns: ["encounter_id"]
isOneToOne: false
      referencedRelation: "encounters"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vouch_requests_requester_id_fkey"
      columns: ["requester_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vouch_requests_target_id_fkey"
      columns: ["target_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"vouch_tiers": {
                  Row: {
                    "emoji": string,"id": number,"min_vouches": number,"name": string
                  }
                  Insert: {
                    "emoji"?: string,"id"?: number,"min_vouches": number,"name": string
                  }
                  Update: {
                    "emoji"?: string,"id"?: number,"min_vouches"?: number,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"vouch_words": {
                  Row: {
                    "active": boolean,"id": number,"sort": number,"word": string
                  }
                  Insert: {
                    "active"?: boolean,"id"?: number,"sort"?: number,"word": string
                  }
                  Update: {
                    "active"?: boolean,"id"?: number,"sort"?: number,"word"?: string
                  }
                  Relationships: [
                    
                  ]
                },"vouches": {
                  Row: {
                    "created_at": string,"encounter_id": number | null,"id": number,"status": Database["public"]['Enums']["vouch_status"],"type": Database["public"]['Enums']["vouch_type"],"vouchee_id": string,"voucher_id": string,"word_id": number | null
                  }
                  Insert: {
                    "created_at"?: string,"encounter_id"?: number | null,"id"?: number,"status"?: Database["public"]['Enums']["vouch_status"],"type": Database["public"]['Enums']["vouch_type"],"vouchee_id": string,"voucher_id": string,"word_id"?: number | null
                  }
                  Update: {
                    "created_at"?: string,"encounter_id"?: number | null,"id"?: number,"status"?: Database["public"]['Enums']["vouch_status"],"type"?: Database["public"]['Enums']["vouch_type"],"vouchee_id"?: string,"voucher_id"?: string,"word_id"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "vouches_encounter_id_fkey"
      columns: ["encounter_id"]
isOneToOne: false
      referencedRelation: "encounters"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vouches_vouchee_id_fkey"
      columns: ["vouchee_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vouches_voucher_id_fkey"
      columns: ["voucher_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vouches_word_id_fkey"
      columns: ["word_id"]
isOneToOne: false
      referencedRelation: "vouch_words"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "are_connected":
{ Args: { "a": string,"b": string }; Returns: boolean
                           },
"can_message":
{ Args: { "p_from": string,"p_to": string }; Returns: boolean
                           },
"can_see_pin":
{ Args: { "p_pin": number,"p_viewer": string }; Returns: boolean
                           },
"check_invite_code":
{ Args: { "p_code": string }; Returns: string
                           },
"config_num":
{ Args: { "p_key": string }; Returns: number
                           },
"degree_between":
{ Args: { "a": string,"b": string }; Returns: number
                           },
"first_degree_ids":
{ Args: { "p_user": string }; Returns: string[]
                           },
"generate_invite_code":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_blocked":
{ Args: { "a": string,"b": string }; Returns: boolean
                           },
"is_conversation_member":
{ Args: { "p_conv": number,"p_user": string }; Returns: boolean
                           },
"is_group_admin":
{ Args: { "p_group": number,"p_user": string }; Returns: boolean
                           },
"is_group_member":
{ Args: { "p_group": number,"p_user": string }; Returns: boolean
                           },
"is_premium":
{ Args: { "p_user": string }; Returns: boolean
                           },
"my_vouches_left_this_month":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"open_direct_conversation":
{ Args: { "p_other": string }; Returns: number
                           },
"plan_limit":
{ Args: { "p_key": string,"p_user": string }; Returns: number
                           },
"profile_age":
{ Args: { "p_user": string }; Returns: number
                           },
"record_communication":
{ Args: { "p_from": string,"p_to": string }; Returns: undefined
                           },
"refresh_vouch_stats":
{ Args: { "p_user": string }; Returns: undefined
                           },
"second_degree":
{ Args: { "p_user": string }; Returns: {
              "user_id": string,"via_ids": (string)[]
            }[]
                           },
"short_name":
{ Args: { "p_full": string }; Returns: string
                           },
"shows_in_nearby":
{ Args: { "p_user": string }; Returns: boolean
                           },
"snap_location":
{ Args: { "p_lat": number,"p_lng": number }; Returns: unknown
                           }
          }
          Enums: {
            "connection_source": "invite"|"intro"|"event"|"group"|"date"|"manual","encounter_context": "venue"|"event"|"group"|"date"|"nearby","going_out_when": "tonight"|"weekend"|"scheduled","group_role": "owner"|"admin"|"member","intro_status": "pending"|"accepted"|"declined","join_type": "request"|"open","location_precision": "approximate"|"precise","pin_audience": "everyone"|"network"|"circle","pin_category": "thought"|"question"|"photos"|"event"|"going_out"|"recap","request_status": "pending"|"accepted"|"declined"|"cancelled","user_role": "user"|"admin","vouch_status": "active"|"flagged"|"revoked","vouch_type": "gps"|"invite"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "connection_source": ["invite", "intro", "event", "group", "date", "manual"],"encounter_context": ["venue", "event", "group", "date", "nearby"],"going_out_when": ["tonight", "weekend", "scheduled"],"group_role": ["owner", "admin", "member"],"intro_status": ["pending", "accepted", "declined"],"join_type": ["request", "open"],"location_precision": ["approximate", "precise"],"pin_audience": ["everyone", "network", "circle"],"pin_category": ["thought", "question", "photos", "event", "going_out", "recap"],"request_status": ["pending", "accepted", "declined", "cancelled"],"user_role": ["user", "admin"],"vouch_status": ["active", "flagged", "revoked"],"vouch_type": ["gps", "invite"]
          }
        }
} as const

