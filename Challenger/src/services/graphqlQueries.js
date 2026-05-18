import { gql } from '@apollo/client/core'

export const NAV_SEARCH_QUERY = gql`
  query NavSearchData($userLimit: Int!, $feedLimit: Int!) {
    users(limit: $userLimit) {
      id
      username
      email
      displayName
      avatarUrl
    }
    feed(limit: $feedLimit) {
      id
      body
    }
  }
`

export const HOME_FEED_QUERY = gql`
  query HomeFeedData($limit: Int!) {
    feed(limit: $limit) {
      id
      body
      mediaUrl
      mediaType
      visibility
      likeCount
      commentCount
      shareCount
      createdAt
      author {
        id
        username
        displayName
        avatarUrl
      }
    }
  }
`

export const CREATE_POST_MUTATION = gql`
  mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      id
      body
      mediaUrl
      mediaType
      visibility
      likeCount
      commentCount
      shareCount
      createdAt
      author {
        id
      }
    }
  }
`

export const UPDATE_POST_MUTATION = gql`
  mutation UpdatePost($id: ID!, $input: UpdatePostInput!) {
    updatePost(id: $id, input: $input) {
      id
      body
      mediaUrl
      mediaType
      visibility
      likeCount
      commentCount
      shareCount
      createdAt
      author {
        id
      }
    }
  }
`

export const DELETE_POST_MUTATION = gql`
  mutation DeletePost($id: ID!) {
    deletePost(id: $id)
  }
`

export const CREATE_STORY_MUTATION = gql`
  mutation CreateStory($input: CreateStoryInput!) {
    createStory(input: $input) {
      id
      body
      mediaUrl
      mediaType
      musicUrl
      musicName
      challengeTitle
      createdAt
      expiresAt
      author {
        id
      }
    }
  }
`

export const UPDATE_STORY_MUTATION = gql`
  mutation UpdateStory($id: ID!, $input: UpdateStoryInput!) {
    updateStory(id: $id, input: $input) {
      id
      body
      mediaUrl
      mediaType
      musicUrl
      musicName
      challengeTitle
      createdAt
      expiresAt
      author {
        id
      }
    }
  }
`

export const DELETE_STORY_MUTATION = gql`
  mutation DeleteStory($id: ID!) {
    deleteStory(id: $id)
  }
`

export const CREATE_MESSAGE_MUTATION = gql`
  mutation CreateMessage($input: CreateMessageInput!) {
    createMessage(input: $input) {
      id
      body
      replyMessageId
      forwardedFromMessageId
      createdAt
      editedAt
      fromUser { id }
      toUser { id }
    }
  }
`

export const UPDATE_MESSAGE_MUTATION = gql`
  mutation UpdateMessage($id: ID!, $input: UpdateMessageInput!) {
    updateMessage(id: $id, input: $input) {
      id
      body
      replyMessageId
      forwardedFromMessageId
      createdAt
      editedAt
      fromUser { id }
      toUser { id }
    }
  }
`

export const DELETE_MESSAGE_MUTATION = gql`
  mutation DeleteMessage($id: ID!) {
    deleteMessage(id: $id)
  }
`

export const FEED_UPDATED_SUBSCRIPTION = gql`
  subscription FeedUpdated {
    feedUpdated {
      id
      body
      createdAt
    }
  }
`

export const MESSAGE_RECEIVED_SUBSCRIPTION = gql`
  subscription MessageReceived($userId: ID!) {
    messageReceived(userId: $userId) {
      id
      body
      replyMessageId
      createdAt
      fromUser {
        id
      }
      toUser {
        id
      }
    }
  }
`
