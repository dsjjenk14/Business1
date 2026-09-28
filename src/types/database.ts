
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
            "analytics_events": {
                  Row: {
                    "created_at": string,"id": number,"name": string,"props": NonNullable<Json>,"user_id": string | null
                  }
                  Insert: {
                    "created_at"?: string,"id"?: number,"name": string,"props"?: NonNullable<Json>,"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: number,"name"?: string,"props"?: NonNullable<Json>,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "analytics_events_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"app_config": {
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
                },"connect_codes": {
                  Row: {
                    "code": string,"created_at": string,"expires_at": string,"kind": string,"owner_id": string,"used_at": string | null,"used_by": string | null
                  }
                  Insert: {
                    "code": string,"created_at"?: string,"expires_at": string,"kind": string,"owner_id": string,"used_at"?: string | null,"used_by"?: string | null
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"expires_at"?: string,"kind"?: string,"owner_id"?: string,"used_at"?: string | null,"used_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "connect_codes_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "connect_codes_used_by_fkey"
      columns: ["used_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
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
                    "created_at": string,"created_by": string | null,"direct_a": string | null,"direct_b": string | null,"group_id": number | null,"id": number,"kind": string,"last_message_at": string | null,"name": string | null
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"direct_a"?: string | null,"direct_b"?: string | null,"group_id"?: number | null,"id"?: number,"kind": string,"last_message_at"?: string | null,"name"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"direct_a"?: string | null,"direct_b"?: string | null,"group_id"?: number | null,"id"?: number,"kind"?: string,"last_message_at"?: string | null,"name"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversations_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
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
                },"date_requests": {
                  Row: {
                    "created_at": string,"from_id": string,"id": number,"note": string | null,"parent_id": number | null,"place_text": string | null,"responded_at": string | null,"starts_at": string | null,"status": Database["public"]['Enums']["date_status"],"to_id": string,"venue_id": number | null,"vibe": string | null,"when_kind": Database["public"]['Enums']["date_when"]
                  }
                  Insert: {
                    "created_at"?: string,"from_id": string,"id"?: number,"note"?: string | null,"parent_id"?: number | null,"place_text"?: string | null,"responded_at"?: string | null,"starts_at"?: string | null,"status"?: Database["public"]['Enums']["date_status"],"to_id": string,"venue_id"?: number | null,"vibe"?: string | null,"when_kind": Database["public"]['Enums']["date_when"]
                  }
                  Update: {
                    "created_at"?: string,"from_id"?: string,"id"?: number,"note"?: string | null,"parent_id"?: number | null,"place_text"?: string | null,"responded_at"?: string | null,"starts_at"?: string | null,"status"?: Database["public"]['Enums']["date_status"],"to_id"?: string,"venue_id"?: number | null,"vibe"?: string | null,"when_kind"?: Database["public"]['Enums']["date_when"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "date_requests_from_id_fkey"
      columns: ["from_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "date_requests_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "date_requests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "date_requests_to_id_fkey"
      columns: ["to_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "date_requests_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"date_session_members": {
                  Row: {
                    "missed_notified": boolean,"next_checkin_at": string | null,"session_id": number,"user_id": string
                  }
                  Insert: {
                    "missed_notified"?: boolean,"next_checkin_at"?: string | null,"session_id": number,"user_id": string
                  }
                  Update: {
                    "missed_notified"?: boolean,"next_checkin_at"?: string | null,"session_id"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "date_session_members_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "date_sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "date_session_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"date_sessions": {
                  Row: {
                    "activated_at": string | null,"checkin_minutes": number,"created_at": string,"date_request_id": number | null,"distance_m": number | null,"ended_at": string | null,"id": number,"initiator_id": string,"last_problem": string | null,"partner_id": string,"status": Database["public"]['Enums']["date_session_status"]
                  }
                  Insert: {
                    "activated_at"?: string | null,"checkin_minutes"?: number,"created_at"?: string,"date_request_id"?: number | null,"distance_m"?: number | null,"ended_at"?: string | null,"id"?: number,"initiator_id": string,"last_problem"?: string | null,"partner_id": string,"status"?: Database["public"]['Enums']["date_session_status"]
                  }
                  Update: {
                    "activated_at"?: string | null,"checkin_minutes"?: number,"created_at"?: string,"date_request_id"?: number | null,"distance_m"?: number | null,"ended_at"?: string | null,"id"?: number,"initiator_id"?: string,"last_problem"?: string | null,"partner_id"?: string,"status"?: Database["public"]['Enums']["date_session_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "date_sessions_date_request_id_fkey"
      columns: ["date_request_id"]
isOneToOne: false
      referencedRelation: "date_requests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "date_sessions_initiator_id_fkey"
      columns: ["initiator_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "date_sessions_partner_id_fkey"
      columns: ["partner_id"]
isOneToOne: false
      referencedRelation: "profiles"
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
                },"event_tickets": {
                  Row: {
                    "amount_cents": number,"created_at": string,"event_id": number,"fee_cents": number,"id": number,"status": string,"stripe_payment_intent": string | null,"stripe_session_id": string,"user_id": string
                  }
                  Insert: {
                    "amount_cents": number,"created_at"?: string,"event_id": number,"fee_cents": number,"id"?: number,"status"?: string,"stripe_payment_intent"?: string | null,"stripe_session_id": string,"user_id": string
                  }
                  Update: {
                    "amount_cents"?: number,"created_at"?: string,"event_id"?: number,"fee_cents"?: number,"id"?: number,"status"?: string,"stripe_payment_intent"?: string | null,"stripe_session_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_tickets_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_tickets_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"event_waitlist": {
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
      foreignKeyName: "event_waitlist_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_waitlist_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"events": {
                  Row: {
                    "approx_location": unknown,"capacity": number | null,"created_at": string,"description": string,"emoji": string | null,"ends_at": string | null,"group_id": number | null,"host_id": string,"id": number,"is_recurring": boolean,"place_text": string | null,"starts_at": string,"ticket_price_cents": number | null,"title": string,"venue_id": number | null
                  }
                  Insert: {
                    "approx_location"?: unknown,"capacity"?: number | null,"created_at"?: string,"description"?: string,"emoji"?: string | null,"ends_at"?: string | null,"group_id"?: number | null,"host_id": string,"id"?: number,"is_recurring"?: boolean,"place_text"?: string | null,"starts_at": string,"ticket_price_cents"?: number | null,"title": string,"venue_id"?: number | null
                  }
                  Update: {
                    "approx_location"?: unknown,"capacity"?: number | null,"created_at"?: string,"description"?: string,"emoji"?: string | null,"ends_at"?: string | null,"group_id"?: number | null,"host_id"?: string,"id"?: number,"is_recurring"?: boolean,"place_text"?: string | null,"starts_at"?: string,"ticket_price_cents"?: number | null,"title"?: string,"venue_id"?: number | null
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
                },"follows": {
                  Row: {
                    "created_at": string,"followee_id": string,"follower_id": string
                  }
                  Insert: {
                    "created_at"?: string,"followee_id": string,"follower_id": string
                  }
                  Update: {
                    "created_at"?: string,"followee_id"?: string,"follower_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "follows_followee_id_fkey"
      columns: ["followee_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "follows_follower_id_fkey"
      columns: ["follower_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"going_out_joins": {
                  Row: {
                    "created_at": string,"post_id": number,"status": Database["public"]['Enums']["going_out_join_status"],"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"post_id": number,"status"?: Database["public"]['Enums']["going_out_join_status"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"post_id"?: number,"status"?: Database["public"]['Enums']["going_out_join_status"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "going_out_joins_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "going_out_posts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "going_out_joins_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"going_out_posts": {
                  Row: {
                    "approx_location": unknown,"arrived_at": string | null,"created_at": string,"event_id": number | null,"expires_at": string,"here_audience": string,"id": number,"is_hosting": boolean,"is_priority": boolean,"live_until": string | null,"note": string | null,"open_to_join": boolean,"place_text": string | null,"starts_at": string,"user_id": string,"venue_id": number | null,"vibes": (string)[],"when_kind": Database["public"]['Enums']["going_out_when"]
                  }
                  Insert: {
                    "approx_location"?: unknown,"arrived_at"?: string | null,"created_at"?: string,"event_id"?: number | null,"expires_at": string,"here_audience"?: string,"id"?: number,"is_hosting"?: boolean,"is_priority"?: boolean,"live_until"?: string | null,"note"?: string | null,"open_to_join"?: boolean,"place_text"?: string | null,"starts_at": string,"user_id": string,"venue_id"?: number | null,"vibes"?: (string)[],"when_kind": Database["public"]['Enums']["going_out_when"]
                  }
                  Update: {
                    "approx_location"?: unknown,"arrived_at"?: string | null,"created_at"?: string,"event_id"?: number | null,"expires_at"?: string,"here_audience"?: string,"id"?: number,"is_hosting"?: boolean,"is_priority"?: boolean,"live_until"?: string | null,"note"?: string | null,"open_to_join"?: boolean,"place_text"?: string | null,"starts_at"?: string,"user_id"?: string,"venue_id"?: number | null,"vibes"?: (string)[],"when_kind"?: Database["public"]['Enums']["going_out_when"]
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
                },"going_out_viewers": {
                  Row: {
                    "post_id": number,"user_id": string
                  }
                  Insert: {
                    "post_id": number,"user_id": string
                  }
                  Update: {
                    "post_id"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "going_out_viewers_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "going_out_posts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "going_out_viewers_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"group_invites": {
                  Row: {
                    "created_at": string,"group_id": number,"invited_by": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"group_id": number,"invited_by": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"group_id"?: number,"invited_by"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "group_invites_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_invites_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_invites_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
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
                    "announcement": string | null,"announcement_at": string | null,"announcement_by": string | null,"category": string,"city_id": number | null,"created_at": string,"description": string,"emoji": string,"id": number,"join_type": Database["public"]['Enums']["join_type"],"name": string,"owner_id": string,"schedule_label": string | null
                  }
                  Insert: {
                    "announcement"?: string | null,"announcement_at"?: string | null,"announcement_by"?: string | null,"category": string,"city_id"?: number | null,"created_at"?: string,"description"?: string,"emoji"?: string,"id"?: number,"join_type"?: Database["public"]['Enums']["join_type"],"name": string,"owner_id": string,"schedule_label"?: string | null
                  }
                  Update: {
                    "announcement"?: string | null,"announcement_at"?: string | null,"announcement_by"?: string | null,"category"?: string,"city_id"?: number | null,"created_at"?: string,"description"?: string,"emoji"?: string,"id"?: number,"join_type"?: Database["public"]['Enums']["join_type"],"name"?: string,"owner_id"?: string,"schedule_label"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "groups_announcement_by_fkey"
      columns: ["announcement_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
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
                },"partner_inquiries": {
                  Row: {
                    "address": string | null,"business_name": string,"contact_name": string,"created_at": string,"email": string,"id": number,"message": string,"phone": string | null,"status": string,"submitted_by": string | null
                  }
                  Insert: {
                    "address"?: string | null,"business_name": string,"contact_name": string,"created_at"?: string,"email": string,"id"?: number,"message"?: string,"phone"?: string | null,"status"?: string,"submitted_by"?: string | null
                  }
                  Update: {
                    "address"?: string | null,"business_name"?: string,"contact_name"?: string,"created_at"?: string,"email"?: string,"id"?: number,"message"?: string,"phone"?: string | null,"status"?: string,"submitted_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "partner_inquiries_submitted_by_fkey"
      columns: ["submitted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"payment_customers": {
                  Row: {
                    "stripe_customer_id": string,"subscribed": boolean,"user_id": string
                  }
                  Insert: {
                    "stripe_customer_id": string,"subscribed"?: boolean,"user_id": string
                  }
                  Update: {
                    "stripe_customer_id"?: string,"subscribed"?: boolean,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_customers_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"payout_accounts": {
                  Row: {
                    "charges_enabled": boolean,"payouts_enabled": boolean,"stripe_account_id": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "charges_enabled"?: boolean,"payouts_enabled"?: boolean,"stripe_account_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "charges_enabled"?: boolean,"payouts_enabled"?: boolean,"stripe_account_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payout_accounts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
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
                    "created_at": string,"kind": string,"pin_id": number,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"kind"?: string,"pin_id": number,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"kind"?: string,"pin_id"?: number,"user_id"?: string
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
                    "author_id": string,"body": string,"created_at": string,"deleted_at": string | null,"hidden_at": string | null,"id": number,"pin_id": number
                  }
                  Insert: {
                    "author_id": string,"body": string,"created_at"?: string,"deleted_at"?: string | null,"hidden_at"?: string | null,"id"?: number,"pin_id": number
                  }
                  Update: {
                    "author_id"?: string,"body"?: string,"created_at"?: string,"deleted_at"?: string | null,"hidden_at"?: string | null,"id"?: number,"pin_id"?: number
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
                    "approx_location": unknown,"audience": Database["public"]['Enums']["pin_audience"],"author_id": string,"body": string,"category": Database["public"]['Enums']["pin_category"],"city_id": number | null,"created_at": string,"deleted_at": string | null,"edited_at": string | null,"event_id": number | null,"going_out_post_id": number | null,"hidden_at": string | null,"id": number,"like_count": number,"place_label": string | null,"reply_count": number,"venue_id": number | null
                  }
                  Insert: {
                    "approx_location"?: unknown,"audience"?: Database["public"]['Enums']["pin_audience"],"author_id": string,"body": string,"category": Database["public"]['Enums']["pin_category"],"city_id"?: number | null,"created_at"?: string,"deleted_at"?: string | null,"edited_at"?: string | null,"event_id"?: number | null,"going_out_post_id"?: number | null,"hidden_at"?: string | null,"id"?: number,"like_count"?: number,"place_label"?: string | null,"reply_count"?: number,"venue_id"?: number | null
                  }
                  Update: {
                    "approx_location"?: unknown,"audience"?: Database["public"]['Enums']["pin_audience"],"author_id"?: string,"body"?: string,"category"?: Database["public"]['Enums']["pin_category"],"city_id"?: number | null,"created_at"?: string,"deleted_at"?: string | null,"edited_at"?: string | null,"event_id"?: number | null,"going_out_post_id"?: number | null,"hidden_at"?: string | null,"id"?: number,"like_count"?: number,"place_label"?: string | null,"reply_count"?: number,"venue_id"?: number | null
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
                    "ai_chat_opt_in": boolean,"birthdate": string,"created_at": string,"email": string | null,"id": string,"onboarding_checklist_dismissed_at": string | null,"phone": string | null,"phone_verified_at": string | null,"terms_accepted_at": string | null
                  }
                  Insert: {
                    "ai_chat_opt_in"?: boolean,"birthdate": string,"created_at"?: string,"email"?: string | null,"id": string,"onboarding_checklist_dismissed_at"?: string | null,"phone"?: string | null,"phone_verified_at"?: string | null,"terms_accepted_at"?: string | null
                  }
                  Update: {
                    "ai_chat_opt_in"?: boolean,"birthdate"?: string,"created_at"?: string,"email"?: string | null,"id"?: string,"onboarding_checklist_dismissed_at"?: string | null,"phone"?: string | null,"phone_verified_at"?: string | null,"terms_accepted_at"?: string | null
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
                },"profile_views": {
                  Row: {
                    "day": string,"viewed_id": string,"viewer_id": string
                  }
                  Insert: {
                    "day"?: string,"viewed_id": string,"viewer_id": string
                  }
                  Update: {
                    "day"?: string,"viewed_id"?: string,"viewer_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profile_views_viewed_id_fkey"
      columns: ["viewed_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profile_views_viewer_id_fkey"
      columns: ["viewer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "approx_location": unknown,"avatar_emoji": string | null,"avatar_url": string | null,"bio": string,"city_id": number | null,"created_at": string,"display_name": string,"full_name": string,"headline": string,"id": string,"id_verified_at": string | null,"invite_code": string,"invited_by": string | null,"is_founding_member": boolean,"location_precision": Database["public"]['Enums']["location_precision"],"member_number": number,"neighborhood": string | null,"photo_verified_at": string | null,"pronouns": string | null,"role": Database["public"]['Enums']["user_role"],"show_age": boolean,"top_vouch_word": string | null,"updated_at": string,"vouch_count": number
                  }
                  Insert: {
                    "approx_location"?: unknown,"avatar_emoji"?: string | null,"avatar_url"?: string | null,"bio"?: string,"city_id"?: number | null,"created_at"?: string,"display_name": string,"full_name": string,"headline"?: string,"id": string,"id_verified_at"?: string | null,"invite_code": string,"invited_by"?: string | null,"is_founding_member"?: boolean,"location_precision"?: Database["public"]['Enums']["location_precision"],"member_number"?: number,"neighborhood"?: string | null,"photo_verified_at"?: string | null,"pronouns"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"show_age"?: boolean,"top_vouch_word"?: string | null,"updated_at"?: string,"vouch_count"?: number
                  }
                  Update: {
                    "approx_location"?: unknown,"avatar_emoji"?: string | null,"avatar_url"?: string | null,"bio"?: string,"city_id"?: number | null,"created_at"?: string,"display_name"?: string,"full_name"?: string,"headline"?: string,"id"?: string,"id_verified_at"?: string | null,"invite_code"?: string,"invited_by"?: string | null,"is_founding_member"?: boolean,"location_precision"?: Database["public"]['Enums']["location_precision"],"member_number"?: number,"neighborhood"?: string | null,"photo_verified_at"?: string | null,"pronouns"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"show_age"?: boolean,"top_vouch_word"?: string | null,"updated_at"?: string,"vouch_count"?: number
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
                },"push_outbox": {
                  Row: {
                    "body": string,"created_at": string,"id": number,"link": string | null,"sent": boolean,"title": string,"user_id": string
                  }
                  Insert: {
                    "body"?: string,"created_at"?: string,"id"?: number,"link"?: string | null,"sent"?: boolean,"title": string,"user_id": string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"id"?: number,"link"?: string | null,"sent"?: boolean,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_outbox_user_id_fkey"
      columns: ["user_id"]
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
                },"reports": {
                  Row: {
                    "admin_notes": string | null,"created_at": string,"details": string,"id": number,"message_id": number | null,"pin_id": number | null,"reason": Database["public"]['Enums']["report_reason"],"reply_id": number | null,"reported_user_id": string | null,"reporter_id": string,"resolved_at": string | null,"status": Database["public"]['Enums']["report_status"]
                  }
                  Insert: {
                    "admin_notes"?: string | null,"created_at"?: string,"details"?: string,"id"?: number,"message_id"?: number | null,"pin_id"?: number | null,"reason": Database["public"]['Enums']["report_reason"],"reply_id"?: number | null,"reported_user_id"?: string | null,"reporter_id": string,"resolved_at"?: string | null,"status"?: Database["public"]['Enums']["report_status"]
                  }
                  Update: {
                    "admin_notes"?: string | null,"created_at"?: string,"details"?: string,"id"?: number,"message_id"?: number | null,"pin_id"?: number | null,"reason"?: Database["public"]['Enums']["report_reason"],"reply_id"?: number | null,"reported_user_id"?: string | null,"reporter_id"?: string,"resolved_at"?: string | null,"status"?: Database["public"]['Enums']["report_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "reports_message_id_fkey"
      columns: ["message_id"]
isOneToOne: false
      referencedRelation: "messages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_pin_id_fkey"
      columns: ["pin_id"]
isOneToOne: false
      referencedRelation: "pins"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_reply_id_fkey"
      columns: ["reply_id"]
isOneToOne: false
      referencedRelation: "pin_replies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_reported_user_id_fkey"
      columns: ["reported_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_reporter_id_fkey"
      columns: ["reporter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"safety_alerts": {
                  Row: {
                    "contacts_notified": number,"created_at": string,"id": number,"level": Database["public"]['Enums']["safety_level"],"resolved_at": string | null,"session_id": number | null,"user_id": string
                  }
                  Insert: {
                    "contacts_notified"?: number,"created_at"?: string,"id"?: number,"level": Database["public"]['Enums']["safety_level"],"resolved_at"?: string | null,"session_id"?: number | null,"user_id": string
                  }
                  Update: {
                    "contacts_notified"?: number,"created_at"?: string,"id"?: number,"level"?: Database["public"]['Enums']["safety_level"],"resolved_at"?: string | null,"session_id"?: number | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "safety_alerts_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "date_sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "safety_alerts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"safety_checkins": {
                  Row: {
                    "created_at": string,"id": number,"kind": string,"session_id": number | null,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: number,"kind": string,"session_id"?: number | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: number,"kind"?: string,"session_id"?: number | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "safety_checkins_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "date_sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "safety_checkins_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"trusted_contacts": {
                  Row: {
                    "created_at": string,"id": number,"name": string,"phone": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: number,"name": string,"phone": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: number,"name"?: string,"phone"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "trusted_contacts_user_id_fkey"
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
                },"venue_placements": {
                  Row: {
                    "created_at": string,"created_by": string | null,"ends_at": string,"id": number,"kind": string,"perk": string,"perk_details": string,"starts_at": string,"venue_id": number
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"ends_at": string,"id"?: number,"kind": string,"perk": string,"perk_details"?: string,"starts_at": string,"venue_id": number
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"ends_at"?: string,"id"?: number,"kind"?: string,"perk"?: string,"perk_details"?: string,"starts_at"?: string,"venue_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "venue_placements_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "venue_placements_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
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
                },"verification_requests": {
                  Row: {
                    "created_at": string,"gesture": string | null,"id": number,"kind": string,"review_note": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"selfie_path": string | null,"status": string,"submitted_at": string | null,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"gesture"?: string | null,"id"?: number,"kind": string,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"selfie_path"?: string | null,"status"?: string,"submitted_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"gesture"?: string | null,"id"?: number,"kind"?: string,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"selfie_path"?: string | null,"status"?: string,"submitted_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "verification_requests_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "verification_requests_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
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
            "add_to_group_chat":
{ Args: { "p_conv": number,"p_members": (string)[] }; Returns: number
                           },
"admin_act_on_report":
{ Args: { "p_action": string,"p_note"?: string,"p_report": number }; Returns: undefined
                           },
"admin_grant_premium":
{ Args: { "p_days": number,"p_email": string }; Returns: string
                           },
"admin_overview":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_reports":
{ Args: Record<PropertyKey, never>; Returns: {
              "about": string,"admin_notes": string,"content": string,"created_at": string,"details": string,"hidden": boolean,"id": number,"message_id": number,"pin_id": number,"reason": Database["public"]['Enums']["report_reason"],"reply_id": number,"reported_id": string,"reported_name": string,"reporter_name": string,"reports_on_target": number,"status": Database["public"]['Enums']["report_status"]
            }[]
                           },
"admin_revenue":
{ Args: Record<PropertyKey, never>; Returns: {
              "fee_cents": number,"gross_cents": number,"month": string,"tickets": number
            }[]
                           },
"admin_review_verification":
{ Args: { "p_approve": boolean,"p_note"?: string,"p_request": number }; Returns: undefined
                           },
"admin_usage":
{ Args: Record<PropertyKey, never>; Returns: {
              "events_30d": number,"events_7d": number,"name": string,"people_30d": number,"people_7d": number
            }[]
                           },
"admin_verifications":
{ Args: Record<PropertyKey, never>; Returns: {
              "avatar_url": string,"display_name": string,"gesture": string,"id": number,"kind": string,"member_since": string,"selfie_path": string,"submitted_at": string,"user_id": string,"vouch_count": number
            }[]
                           },
"arrival_regions":
{ Args: Record<PropertyKey, never>; Returns: {
              "key": string,"lat": number,"lng": number,"radius_m": number,"title": string
            }[]
                           },
"arrival_targets":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"auto_arrive":
{ Args: { "p_accuracy_m"?: number,"p_lat": number,"p_lng": number }; Returns: Json
                           },
"block_user":
{ Args: { "p_user": string }; Returns: undefined
                           },
"cancel_date_request":
{ Args: { "p_request": number }; Returns: undefined
                           },
"chat_candidates":
{ Args: Record<PropertyKey, never>; Returns: {
              "avatar_url": string,"display_name": string,"id": string,"in_circle": boolean
            }[]
                           },
"check_in":
{ Args: { "p_accuracy_m"?: number,"p_event_id"?: number,"p_lat": number,"p_lng": number,"p_venue_id"?: number }; Returns: {
              "already_vouched": boolean,"avatar_emoji": string,"avatar_url": string,"degree": number,"display_name": string,"encounter_id": number,"met_at": string,"place_label": string,"user_id": string,"vouch_count": number
            }[]
                           },
"check_invite_code":
{ Args: { "p_code": string }; Returns: string
                           },
"circle_overview":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"config_num":
{ Args: { "p_key": string }; Returns: number
                           },
"confirm_date_mode":
{ Args: { "p_accuracy_m"?: number,"p_lat": number,"p_lng": number,"p_session": number }; Returns: Json
                           },
"conversation_info":
{ Args: { "p_conv": number }; Returns: Json
                           },
"counter_date_request":
{ Args: { "p_note"?: string,"p_place"?: string,"p_request": number,"p_starts_at"?: string,"p_venue_id"?: number,"p_vibe"?: string,"p_when": Database["public"]['Enums']["date_when"] }; Returns: number
                           },
"create_connect_code":
{ Args: { "p_kind": string }; Returns: Json
                           },
"create_event":
{ Args: { "p_capacity"?: number,"p_description"?: string,"p_duration_hours"?: number,"p_emoji"?: string,"p_group"?: number,"p_lat"?: number,"p_lng"?: number,"p_place"?: string,"p_starts_at": string,"p_title": string,"p_venue_id"?: number }; Returns: number
                           },
"create_group":
{ Args: { "p_category": string,"p_description"?: string,"p_emoji"?: string,"p_invite"?: (string)[],"p_join_type"?: Database["public"]['Enums']["join_type"],"p_name": string,"p_schedule"?: string }; Returns: number
                           },
"create_group_chat":
{ Args: { "p_members": (string)[],"p_name": string }; Returns: number
                           },
"date_mode_candidates":
{ Args: Record<PropertyKey, never>; Returns: {
              "avatar_url": string,"detail": string,"display_name": string,"user_id": string,"vouch_count": number
            }[]
                           },
"date_mode_status":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"date_request_detail":
{ Args: { "p_request": number }; Returns: Json
                           },
"decline_intro_request":
{ Args: { "p_request": number }; Returns: undefined
                           },
"delete_going_out":
{ Args: { "p_post": number }; Returns: undefined
                           },
"effective_radius_mi":
{ Args: { "p_limit_key": string,"p_requested": number }; Returns: number
                           },
"end_date_mode":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"end_live":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"event_check_in":
{ Args: { "p_accuracy_m"?: number,"p_event": number,"p_lat": number,"p_lng": number }; Returns: {
              "already_vouched": boolean,"avatar_emoji": string,"avatar_url": string,"degree": number,"display_name": string,"encounter_id": number,"met_at": string,"place_label": string,"user_id": string,"vouch_count": number
            }[]
                           },
"event_detail":
{ Args: { "p_event": number }; Returns: Json
                           },
"event_ticket_holders":
{ Args: { "p_event": number }; Returns: {
              "amount_cents": number,"bought_at": string,"display_name": string,"status": string,"ticket_id": number,"user_id": string
            }[]
                           },
"featured_places":
{ Args: { "p_lat"?: number,"p_lng"?: number }; Returns: {
              "category": string,"distance_mi": number,"ends_at": string,"glyph": string,"kind": string,"name": string,"neighborhood": string,"network_visited": number,"perk": string,"perk_details": string,"placement_id": number,"price_level": number,"venue_id": number
            }[]
                           },
"feed_placement":
{ Args: { "p_lat"?: number,"p_lng"?: number }; Returns: {
              "distance_mi": number,"glyph": string,"kind": string,"name": string,"neighborhood": string,"network_visited": number,"perk": string,"placement_id": number,"venue_id": number
            }[]
                           },
"follow_info":
{ Args: { "p_user": string }; Returns: Json
                           },
"follow_user":
{ Args: { "p_user": string }; Returns: undefined
                           },
"generate_invite_code":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"go_live":
{ Args: { "p_lat"?: number,"p_lng"?: number,"p_note"?: string,"p_place"?: string,"p_venue_id"?: number,"p_vibes"?: (string)[] }; Returns: number
                           },
"going_out_feed":
{ Args: { "p_lat"?: number,"p_lng"?: number,"p_radius_mi"?: number,"p_when": string }; Returns: Json
                           },
"group_announcement":
{ Args: { "p_group": number }; Returns: Json
                           },
"group_detail":
{ Args: { "p_group": number }; Returns: Json
                           },
"groups_overview":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"here_viewers":
{ Args: { "p_post": number }; Returns: (string)[]
                           },
"home_feed":
{ Args: { "p_lat"?: number,"p_lng"?: number,"p_scope"?: string }; Returns: Json
                           },
"im_here":
{ Args: { "p_lat"?: number,"p_lng"?: number,"p_post"?: number }; Returns: string
                           },
"inbox":
{ Args: Record<PropertyKey, never>; Returns: {
              "avatar_url": string,"conversation_id": number,"glyph": string,"group_id": number,"kind": string,"last_at": string,"last_body": string,"last_sender_id": string,"other_id": string,"title": string,"unread": boolean
            }[]
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_premium":
{ Args: { "p_user": string }; Returns: boolean
                           },
"join_going_out":
{ Args: { "p_post": number,"p_status"?: Database["public"]['Enums']["going_out_join_status"] }; Returns: undefined
                           },
"join_group":
{ Args: { "p_group": number }; Returns: string
                           },
"join_waitlist":
{ Args: { "p_event": number }; Returns: number
                           },
"leave_group":
{ Args: { "p_group": number }; Returns: undefined
                           },
"leave_group_chat":
{ Args: { "p_conv": number }; Returns: undefined
                           },
"leave_waitlist":
{ Args: { "p_event": number }; Returns: undefined
                           },
"make_intro":
{ Args: { "p_a": string,"p_b": string,"p_message": string,"p_request"?: number }; Returns: number
                           },
"mark_contacts_notified":
{ Args: { "p_alert": number,"p_count": number }; Returns: undefined
                           },
"message_status":
{ Args: { "p_other": string }; Returns: Json
                           },
"my_blocked":
{ Args: Record<PropertyKey, never>; Returns: {
              "avatar_emoji": string,"avatar_url": string,"blocked_at": string,"display_name": string,"user_id": string
            }[]
                           },
"my_dates":
{ Args: Record<PropertyKey, never>; Returns: {
              "created_at": string,"i_sent": boolean,"id": number,"label": string,"other_avatar_url": string,"other_id": string,"other_name": string,"status": Database["public"]['Enums']["date_status"],"vibe": string
            }[]
                           },
"my_going_out_company":
{ Args: { "p_post": number }; Returns: {
              "avatar_url": string,"display_name": string,"status": Database["public"]['Enums']["going_out_join_status"],"updated_at": string,"user_id": string
            }[]
                           },
"my_group_events":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_intros":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_payout_status":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_plan":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_recent_meetups":
{ Args: { "p_minutes"?: number }; Returns: {
              "already_vouched": boolean,"avatar_emoji": string,"avatar_url": string,"degree": number,"display_name": string,"encounter_id": number,"met_at": string,"place_label": string,"user_id": string,"vouch_count": number
            }[]
                           },
"my_reports":
{ Args: Record<PropertyKey, never>; Returns: {
              "about": string,"created_at": string,"id": number,"reason": Database["public"]['Enums']["report_reason"],"reported_name": string,"status": Database["public"]['Enums']["report_status"]
            }[]
                           },
"my_tickets":
{ Args: Record<PropertyKey, never>; Returns: {
              "amount_cents": number,"bought_at": string,"event_id": number,"place": string,"starts_at": string,"status": string,"ticket_id": number,"title": string
            }[]
                           },
"my_verification":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_vouches_left_this_month":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"network_activity":
{ Args: { "p_limit"?: number }; Returns: {
              "actor_avatar": string,"actor_emoji": string,"actor_id": string,"actor_name": string,"at": string,"detail": string,"kind": string,"subject_id": string,"subject_name": string
            }[]
                           },
"open_direct_conversation":
{ Args: { "p_other": string }; Returns: number
                           },
"photo_verification_challenge":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"pins_feed":
{ Args: { "p_author"?: string,"p_before"?: string,"p_category"?: Database["public"]['Enums']["pin_category"],"p_lat"?: number,"p_limit"?: number,"p_lng"?: number,"p_mode": string,"p_pin"?: number,"p_radius_mi"?: number }; Returns: {
              "audience": Database["public"]['Enums']["pin_audience"],"author_avatar": string,"author_emoji": string,"author_id": string,"author_name": string,"author_verified": boolean,"author_vouches": number,"body": string,"bookmarked": boolean,"category": Database["public"]['Enums']["pin_category"],"city_name": string,"created_at": string,"distance_mi": number,"edited_at": string,"event_going_count": number,"event_i_am_going": boolean,"event_id": number,"event_starts_at": string,"event_title": string,"id": number,"is_mine": boolean,"like_count": number,"liked": boolean,"my_reaction": string,"photo_paths": (string)[],"place_label": string,"reply_count": number,"top_reactions": (string)[]
            }[]
                           },
"plan_limit":
{ Args: { "p_key": string,"p_user": string }; Returns: number
                           },
"post_going_out":
{ Args: { "p_lat"?: number,"p_lng"?: number,"p_note"?: string,"p_place"?: string,"p_starts_at"?: string,"p_venue_id"?: number,"p_vibes"?: (string)[],"p_when": Database["public"]['Enums']["going_out_when"] }; Returns: number
                           },
"post_group_announcement":
{ Args: { "p_group": number,"p_text": string }; Returns: undefined
                           },
"post_recap":
{ Args: { "p_body": string,"p_event": number,"p_tags"?: (string)[] }; Returns: number
                           },
"prepare_account_deletion":
{ Args: { "p_user": string }; Returns: undefined
                           },
"profile_age":
{ Args: { "p_user": string }; Returns: number
                           },
"profile_analytics":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"profile_card":
{ Args: { "p_user": string }; Returns: Json
                           },
"raise_safety_alert":
{ Args: { "p_lat"?: number,"p_level": Database["public"]['Enums']["safety_level"],"p_lng"?: number }; Returns: Json
                           },
"react_to_pin":
{ Args: { "p_kind": string,"p_pin": number }; Returns: undefined
                           },
"record_communication":
{ Args: { "p_from": string,"p_to": string }; Returns: undefined
                           },
"record_profile_view":
{ Args: { "p_user": string }; Returns: undefined
                           },
"redeem_connect_code":
{ Args: { "p_code": string }; Returns: Json
                           },
"refresh_vouch_stats":
{ Args: { "p_user": string }; Returns: undefined
                           },
"register_push_token":
{ Args: { "p_platform": string,"p_token": string }; Returns: undefined
                           },
"rename_group_chat":
{ Args: { "p_conv": number,"p_name": string }; Returns: undefined
                           },
"report":
{ Args: { "p_details"?: string,"p_message"?: number,"p_pin"?: number,"p_reason": Database["public"]['Enums']["report_reason"],"p_reply"?: number,"p_user"?: string }; Returns: number
                           },
"request_intro":
{ Args: { "p_note"?: string,"p_target": string,"p_via": string }; Returns: number
                           },
"request_join_group":
{ Args: { "p_group": number,"p_how"?: string,"p_why": string }; Returns: number
                           },
"request_vouch":
{ Args: { "p_target": string }; Returns: number
                           },
"resolve_safety_alert":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"respond_date_request":
{ Args: { "p_accept": boolean,"p_request": number }; Returns: string
                           },
"respond_intro":
{ Args: { "p_accept": boolean,"p_intro": number }; Returns: string
                           },
"review_join_request":
{ Args: { "p_approve": boolean,"p_request": number }; Returns: undefined
                           },
"safety_check_in":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"search_members":
{ Args: { "p_limit"?: number,"p_query": string }; Returns: {
              "avatar_emoji": string,"avatar_url": string,"degree": number,"display_name": string,"headline": string,"id": string,"via_name": string,"vouch_count": number
            }[]
                           },
"search_venues":
{ Args: { "p_lat"?: number,"p_lng"?: number,"p_query"?: string }; Returns: {
              "category": string,"distance_mi": number,"emoji": string,"id": number,"name": string,"neighborhood": string
            }[]
                           },
"send_date_request":
{ Args: { "p_note"?: string,"p_place"?: string,"p_starts_at"?: string,"p_to": string,"p_venue_id"?: number,"p_vibe"?: string,"p_when": Database["public"]['Enums']["date_when"] }; Returns: number
                           },
"set_checkin_interval":
{ Args: { "p_minutes": number }; Returns: undefined
                           },
"set_group_role":
{ Args: { "p_group": number,"p_role": Database["public"]['Enums']["group_role"],"p_user": string }; Returns: undefined
                           },
"set_here_audience":
{ Args: { "p_audience": string,"p_post": number }; Returns: undefined
                           },
"set_here_viewers":
{ Args: { "p_post": number,"p_viewers": (string)[] }; Returns: number
                           },
"set_open_to_join":
{ Args: { "p_open": boolean,"p_post": number }; Returns: undefined
                           },
"set_ticket_price":
{ Args: { "p_cents": number,"p_event": number }; Returns: undefined
                           },
"share_event":
{ Args: { "p_audience"?: Database["public"]['Enums']["pin_audience"],"p_event": number,"p_note"?: string }; Returns: number
                           },
"short_name":
{ Args: { "p_full": string }; Returns: string
                           },
"shows_going_out_venue":
{ Args: { "p_user": string }; Returns: boolean
                           },
"shows_in_nearby":
{ Args: { "p_user": string }; Returns: boolean
                           },
"snap_geography":
{ Args: { "p": unknown }; Returns: unknown
                           },
"snap_location":
{ Args: { "p_lat": number,"p_lng": number }; Returns: unknown
                           },
"start_date_mode":
{ Args: { "p_accuracy_m"?: number,"p_lat": number,"p_lng": number,"p_partner": string }; Returns: number
                           },
"stripe_account_updated":
{ Args: { "p_account": string,"p_charges": boolean,"p_payouts": boolean }; Returns: undefined
                           },
"stripe_checkout_check":
{ Args: { "p_event": number,"p_user": string }; Returns: Json
                           },
"stripe_payout_account_set":
{ Args: { "p_account": string,"p_user": string }; Returns: undefined
                           },
"stripe_premium_ended":
{ Args: { "p_user": string }; Returns: undefined
                           },
"stripe_premium_paid":
{ Args: { "p_until": string,"p_user": string }; Returns: string
                           },
"stripe_premium_state":
{ Args: { "p_user": string }; Returns: Json
                           },
"stripe_refund_check":
{ Args: { "p_host": string,"p_ticket": number }; Returns: Json
                           },
"stripe_set_customer":
{ Args: { "p_customer": string,"p_user": string }; Returns: undefined
                           },
"stripe_ticket_paid":
{ Args: { "p_amount": number,"p_event": number,"p_fee": number,"p_payment_intent": string,"p_session": string,"p_user": string }; Returns: string
                           },
"stripe_ticket_refunded":
{ Args: { "p_payment_intent": string }; Returns: undefined
                           },
"submit_partner_inquiry":
{ Args: { "p_address"?: string,"p_business": string,"p_contact": string,"p_email": string,"p_message"?: string,"p_phone"?: string }; Returns: number
                           },
"submit_photo_verification":
{ Args: { "p_path": string,"p_request": number }; Returns: undefined
                           },
"tonight_ends_at":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"tonight_network":
{ Args: Record<PropertyKey, never>; Returns: {
              "avatar_emoji": string,"avatar_url": string,"degree": number,"display_name": string,"here_since": string,"is_hosting": boolean,"is_me": boolean,"place": string,"starts_at": string,"user_id": string
            }[]
                           },
"tonight_pick":
{ Args: Record<PropertyKey, never>; Returns: {
              "emoji": string,"event_id": number,"going_count": number,"host_name": string,"neighborhood": string,"network_going": (string)[],"spots_left": number,"starts_at": string,"title": string,"venue_name": string
            }[]
                           },
"track":
{ Args: { "p_name": string,"p_props"?: Json }; Returns: undefined
                           },
"unblock_user":
{ Args: { "p_user": string }; Returns: undefined
                           },
"unfollow_user":
{ Args: { "p_user": string }; Returns: undefined
                           },
"unregister_push_token":
{ Args: { "p_token": string }; Returns: undefined
                           },
"venue_detail":
{ Args: { "p_venue": number }; Returns: Json
                           },
"visible_vouch_count":
{ Args: { "p_user": string }; Returns: number
                           },
"weekend_ends_at":
{ Args: Record<PropertyKey, never>; Returns: string
                           }
          }
          Enums: {
            "connection_source": "invite"|"intro"|"event"|"group"|"date"|"manual"|"qr"|"code","date_session_status": "waiting"|"active"|"ended"|"cancelled","date_status": "pending"|"accepted"|"countered"|"passed"|"cancelled","date_when": "tonight"|"this_weekend"|"next_week"|"specific","encounter_context": "venue"|"event"|"group"|"date"|"nearby","going_out_join_status": "heading"|"here","going_out_when": "tonight"|"weekend"|"scheduled","group_role": "owner"|"admin"|"member","intro_status": "pending"|"accepted"|"declined","join_type": "request"|"open","location_precision": "approximate"|"precise","pin_audience": "everyone"|"network"|"circle","pin_category": "thought"|"question"|"photos"|"event"|"going_out"|"recap","report_reason": "misrepresentation"|"harassment"|"unsafe"|"privacy"|"spam"|"inappropriate"|"other","report_status": "open"|"reviewing"|"resolved"|"dismissed","request_status": "pending"|"accepted"|"declined"|"cancelled","safety_level": "unsafe"|"leaving"|"emergency","user_role": "user"|"admin","vouch_status": "active"|"flagged"|"revoked","vouch_type": "gps"|"invite"
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
            "connection_source": ["invite", "intro", "event", "group", "date", "manual", "qr", "code"],"date_session_status": ["waiting", "active", "ended", "cancelled"],"date_status": ["pending", "accepted", "countered", "passed", "cancelled"],"date_when": ["tonight", "this_weekend", "next_week", "specific"],"encounter_context": ["venue", "event", "group", "date", "nearby"],"going_out_join_status": ["heading", "here"],"going_out_when": ["tonight", "weekend", "scheduled"],"group_role": ["owner", "admin", "member"],"intro_status": ["pending", "accepted", "declined"],"join_type": ["request", "open"],"location_precision": ["approximate", "precise"],"pin_audience": ["everyone", "network", "circle"],"pin_category": ["thought", "question", "photos", "event", "going_out", "recap"],"report_reason": ["misrepresentation", "harassment", "unsafe", "privacy", "spam", "inappropriate", "other"],"report_status": ["open", "reviewing", "resolved", "dismissed"],"request_status": ["pending", "accepted", "declined", "cancelled"],"safety_level": ["unsafe", "leaving", "emergency"],"user_role": ["user", "admin"],"vouch_status": ["active", "flagged", "revoked"],"vouch_type": ["gps", "invite"]
          }
        }
} as const

