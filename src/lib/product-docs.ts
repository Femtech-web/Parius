export type DocSection = {
  title: string;
  paragraphs?: string[];
  steps?: string[];
  terms?: [string, string][];
  note?: string;
};
export type ProductDoc = {
  slug: string;
  title: string;
  description: string;
  sections: DocSection[];
};
export const productDocs: ProductDoc[] = [
  {
    slug: 'getting-started',
    title: 'Start a project',
    description:
      'Bring your client into one private workspace, with a clear place for every decision.',
    sections: [
      {
        title: 'If you’re the freelancer',
        steps: [
          'Sign in to Parius and choose New project.',
          'Give the project a name, describe the work and add your client’s name.',
          'Create an invitation. Send the private invitation link to your client, or use the email invitation option.',
          'Once your client accepts, you can both use the project conversation.',
        ],
        note: 'An invitation is single-use and expires after seven days. Your client must sign in with their own account.',
      },
      {
        title: 'If you’re the client',
        paragraphs: [
          'Open the invitation your freelancer sent you. Sign in, check the project and accept the invitation. You’ll join as the client; you don’t need to create a second project.',
          'Accepting an invitation gives you access to the workspace. You’ll review the agreement and authorize any payment separately.',
        ],
      },
      {
        title: 'Find your way around',
        terms: [
          ['Conversation', 'Discuss the work and review requests that may change the scope.'],
          ['Agreement', 'Propose, compare and approve the project terms.'],
          ['Milestones', 'Track progress and review completed work.'],
          ['Payments', 'See invoices, receipts, payment promises and follow-ups.'],
          ['Files', 'Share references, review previews and receive final deliverables.'],
          ['Memory', 'Freelancers review the lessons Parius should remember.'],
          ['Activity', 'See shared project events, such as approvals, receipts and file releases.'],
        ],
      },
    ],
  },
  {
    slug: 'agreements',
    title: 'Agree on the work',
    description:
      'Set the scope, price and revision limit. Both people approve the same version before it becomes active.',
    sections: [
      {
        title: 'Write the first proposal',
        paragraphs: [
          'In Agreement, the freelancer creates a proposal describing the deliverables, price and revision limit. Include what is outside the scope and when final files should be released.',
          'For example: “A five-page website with a contact form and two revision rounds. A shop and checkout are outside this scope. Final files are released after client acceptance and full payment.”',
        ],
      },
      {
        title: 'Review and approve',
        steps: [
          'The freelancer publishes the proposal and approves that version.',
          'The client reads the exact terms. They can approve it, reject it with a reason, or discuss changes in Conversation.',
          'When both people approve the same version, it becomes the active agreement. Milestones and invoices use that approved agreement.',
        ],
      },
      {
        title: 'When the work changes',
        paragraphs: [
          'Discuss the change first. The freelancer can publish a new proposal with updated scope or price. Compare it with the previous version before approving.',
          'The existing agreement stays active until both people approve the replacement. The freelancer can withdraw a pending proposal; the client can reject one. An active agreement cannot be withdrawn through that proposal control.',
        ],
        note: 'A message, AI suggestion or new proposal does not automatically change the agreed price or charge the client.',
      },
    ],
  },
  {
    slug: 'conversation',
    title: 'Discuss requests and review scope',
    description:
      'Keep the conversation with the agreement, so an extra request gets a clear answer.',
    sections: [
      {
        title: 'Talk in the project',
        paragraphs: [
          'Both members can send messages in Conversation. If a request arrived somewhere else, use Quote from another app to keep a copy with the project.',
          'A conversation is a place to discuss changes. To change the actual terms, publish and approve a new agreement version.',
        ],
      },
      {
        title: 'Check a new request',
        steps: [
          'Once an agreement is active, the freelancer clicks Review scope on a request.',
          'Parius compares the request with the approved agreement and recalls relevant confirmed lessons from Walrus Memory.',
          'Read the explanation, agreement quotation and any cited lesson. Decide whether to keep the current scope, clarify the request or prepare a new proposal.',
        ],
        note: 'Scope review starts when the freelancer requests it. Walrus does not continuously watch the conversation or approve changes.',
      },
      {
        title: 'Use the suggested reply',
        paragraphs: [
          'Parius can draft a reply explaining the scope decision. Choose Use reply draft to put it in the message box, edit it, then send it yourself.',
          'The review is private to the freelancer. The client sees the message you send, not your private AI review. If a provider cannot complete the review, an error stays visible and the agreement remains unchanged.',
        ],
      },
    ],
  },
  {
    slug: 'milestones',
    title: 'Track and review milestones',
    description: 'Break the agreed work into clear stages and let the client review each one.',
    sections: [
      {
        title: 'Create a stage of work',
        paragraphs: [
          'After the agreement is approved, the freelancer adds milestones in Milestones. Give each one a clear name and an optional due date. Both members can see them.',
          'For a website, your milestones might be “Website design” and “Build and handoff”. You can link files and invoices to the relevant milestone.',
        ],
      },
      {
        title: 'Move through review',
        steps: [
          'The freelancer starts the milestone when work begins.',
          'Upload a milestone preview in Files if there is work for the client to inspect.',
          'The freelancer submits the milestone for review.',
          'The client accepts it or requests changes. If changes are requested, the freelancer updates the work and submits it again.',
        ],
      },
      {
        title: 'What acceptance means',
        paragraphs: [
          'Acceptance records that the client approved that stage of work. It does not send a payment or automatically unlock a final file.',
          'An invoice can be linked to the milestone so both people can see which work the payment covers. Final-file conditions are checked separately.',
        ],
      },
    ],
  },
  {
    slug: 'files',
    title: 'Share files and release finals',
    description:
      'Choose a file’s purpose so the client knows what they can review now and what will be handed over later.',
    sections: [
      {
        title: 'Choose the right file type',
        terms: [
          [
            'Shared attachment',
            'A brief, reference or supporting document. Both project members can download it when the upload is ready.',
          ],
          [
            'Milestone preview',
            'Work the client can inspect before accepting a milestone. It is available to both members and linked to that milestone.',
          ],
          [
            'Final deliverable',
            'The finished handoff file. It stays locked for the client until its agreed conditions are met and the freelancer explicitly releases it.',
          ],
        ],
        note: 'Uploads support PDF, PNG, JPG, WebP, TXT and ZIP, up to 10 MB per file. The app checks the file content as well as its extension.',
      },
      {
        title: 'Set up a final deliverable',
        steps: [
          'As freelancer, choose Final deliverable and link it to the relevant milestone.',
          'Choose the release condition that matches the active agreement. For a payment condition, link the issued invoice too.',
          'Quote the exact release clause from that agreement, then choose Upload locked final.',
          'The client can see the file’s listing and lock status, but cannot download the locked final. Share a milestone preview if they need to inspect the work first.',
        ],
      },
      {
        title: 'Complete the handoff',
        paragraphs: [
          'For an acceptance-and-payment condition, the client must accept the milestone and the linked invoice must be paid in the recorded ledger. The freelancer then selects Release final, checks the conditions and confirms the release.',
          'The client can now download the final. Locking a file controls its download; the client can still pay the issued invoice while the file is locked.',
        ],
        note: 'Removing a file blocks new downloads immediately. A download link already issued may remain valid for up to 60 seconds while storage cleanup finishes.',
      },
    ],
  },
  {
    slug: 'payments',
    title: 'Send an invoice and get paid',
    description:
      'The client sends the payment. Tatum checks the transfer. The freelancer records it against the invoice.',
    sections: [
      {
        title: 'Freelancer: issue the invoice',
        steps: [
          'In Payments, choose Draft invoice. Enter its title, amount, optional due date and related milestone.',
          'Check the draft. It is private to the freelancer and must fit within the approved project total.',
          'Connect and verify the receiving wallet when using Sui, then issue the invoice. The client can now see it.',
        ],
      },
      {
        title: 'Client: review and pay',
        steps: [
          'Connect your sending wallet and confirm ownership. Use the network shown in Parius. A saved ownership proof is separate from the wallet connection needed to sign a transfer.',
          'Choose Review & pay on the invoice. Check the exact token, network, receiving address and amount.',
          'Confirm the instructions. This first confirmation does not send money.',
          'Prepare the payment, review it in your wallet and approve the transfer. In the current Testnet flow, USDC pays the invoice and SUI pays the network fee when you choose wallet-paid gas.',
          'Use Check saved digest with Tatum to check the saved transaction ID. Once it matches, wait for the freelancer to reconcile the receipt.',
        ],
        note: 'Use Already sent a transfer? (backup) only when checking an existing transfer by pasting its transaction ID. A check does not send another payment. If the result is uncertain, retry the same saved digest before sending anything else.',
      },
      {
        title: 'Freelancer: reconcile the receipt',
        steps: [
          'Open the invoice’s Payment history and choose Refresh history.',
          'Find Tatum matched · awaiting reconciliation, then select Review & reconcile receipt.',
          'If you did not already record that same payment manually, leave No matching manual receipt selected. Otherwise select the matching active manual record so the payment is not counted twice.',
          'Choose Confirm receipt allocation. The received and remaining amounts update. A fully covered invoice shows PAID.',
        ],
        note: 'Reconciliation records a transfer that already happened. It does not move funds again or release the final file.',
      },
      {
        title: 'Understand the payment status',
        terms: [
          [
            'Instructions confirmed',
            'The payment details have been reviewed. A transfer still needs to be signed and sent.',
          ],
          [
            'Tatum matched',
            'The on-chain transfer matches the instructions. Freelancer reconciliation is still required.',
          ],
          ['Receipt reconciled', 'The verified receipt is allocated to this invoice.'],
          [
            'Manual receipt',
            'A payment recorded by the freelancer without blockchain verification. It affects the ledger and can be reversed; reversing it is not a refund.',
          ],
          [
            'PAID',
            'Recorded receipts cover the invoice amount. Final files still need their own release conditions and explicit release.',
          ],
        ],
      },
      {
        title: 'Choose a wallet',
        paragraphs: [
          'Connect Slush to use an existing Sui wallet. Use Google wallet opens the configured Enoki wallet flow; it does not automatically connect the address you created in Slush, even if you use the same Google account.',
          'Sui Testnet tokens have no monetary value. The current payment walkthrough uses Testnet. Always check the network and exact token shown before signing. Parius does not hold your payment in escrow.',
        ],
      },
    ],
  },
  {
    slug: 'follow-ups',
    title: 'Handle promises and follow-ups',
    description:
      'Keep a payment promise on record and prepare a clear reminder without sending it by accident.',
    sections: [
      {
        title: 'Record a payment promise',
        paragraphs: [
          'In an invoice’s Promises & follow-ups, the freelancer can record what the client said they would pay and when. A promise reported by the freelancer stays unconfirmed until the client confirms it.',
          'The client can also add a payment promise directly. A promise is a statement of intent: it does not create a receipt, reduce the balance or change the invoice due date.',
        ],
      },
      {
        title: 'Prepare a reminder',
        steps: [
          'As freelancer, choose Draft follow-up. Parius supplies the saved invoice facts and uses AI to help with the wording, or clearly labels a template if AI is unavailable.',
          'Read the amount, due date and any promise attribution. Edit the message and save your private draft.',
          'Choose Review & send. Read the final text, confirm it and send once.',
          'The message appears in Conversation under your name. The client cannot see an unsent draft.',
        ],
        note: 'If a receipt or payment promise changes, refresh the draft’s facts before sending. A reminder never changes the amount owed or authorizes a payment.',
      },
    ],
  },
  {
    slug: 'memory',
    title: 'Teach Parius what to remember',
    description: 'Turn a useful correction into a lesson you can inspect, confirm and use again.',
    sections: [
      {
        title: 'A lesson is a reusable decision',
        paragraphs: [
          'For example: “Before accepting an extra feature, ask for a separately priced change proposal.” This helps Parius suggest a reply that reflects how you want to handle new work.',
          'A lesson does not rewrite your agreement or train a new AI model. Parius recalls relevant confirmed lessons as context for a later scope review.',
        ],
      },
      {
        title: 'Confirm a suggested lesson',
        steps: [
          'Review scope on a request. An eligible scope review can produce a short suggested lesson.',
          'Open Memory or choose Review suggested lessons. Read the suggestion and edit it if needed.',
          'Confirm it to save the lesson, or dismiss it. You can also add a lesson manually.',
          'Wait for Stored on Walrus before treating remote storage as complete. A later relevant scope review can recall and cite it, including in a new session.',
        ],
      },
      {
        title: 'Understand storage and privacy',
        paragraphs: [
          'Confirmed · awaiting storage means you approved the lesson and it is queued for storage. Walrus is indexing means processing is still underway. Stored on Walrus means storage completed and evidence is available. Provider errors stay visible.',
          'Memory belongs to the freelancer. Personal lessons stay private to that person; project lessons are used within their project context. The client cannot see the freelancer’s Memory.',
        ],
        note: 'You can correct or exclude a lesson. A permanent-deletion request immediately excludes it from Parius recall; remote deletion remains pending account-owner handling until completed separately.',
      },
      {
        title: 'Compare with and without memory',
        paragraphs: [
          'Compare suggestions runs two reviews of the same saved agreement and request, with recalled lessons as the changed input. Read the cited lesson to see what was used.',
          'Similar answers are valid when the agreement already gives a clear answer. If Walrus recall is unavailable, the comparison shows an error rather than silently using a local copy.',
        ],
      },
    ],
  },
  {
    slug: 'agents',
    title: 'Connect a project agent',
    description:
      'Optional: let a compatible AI tool read one project or help carry out one reviewed Testnet payment.',
    sections: [
      {
        title: 'Start with read-only access',
        steps: [
          'In Payments, open Connect a project agent.',
          'Name the connection, leave Read project only selected and create a one-hour key.',
          'Copy the key into your MCP client’s private configuration. Connect to /api/mcp with that key as a Bearer authorization header.',
          'The agent can read this project’s approved agreement, milestones, role-visible invoices and latest 30 messages. Revoke the key in Parius when you are finished.',
        ],
        note: 'Keep the key private. The agent cannot read personal memories, private AI reviews or file contents, send messages, change agreements, reconcile receipts or release files.',
      },
      {
        title: 'Delegate one reviewed payment',
        paragraphs: [
          'This option is for a dedicated local Testnet agent wallet, separate from your existing Slush wallet. Verify its sender address as the client, then confirm a fresh invoice request for that address.',
          'Create a connection limited to that one request. The payment runner first previews the exact amount, recipient and network. Execution requires those same values and explicit authorization. It saves the signed transaction before sending so retries can use the same transaction.',
        ],
      },
      {
        title: 'What happens next',
        paragraphs: [
          'The agent uses MPP, a protocol that lets a service request a payment and receive its proof. Parius checks the transfer through Tatum and records the matched receipt.',
          'The freelancer still reconciles the receipt and explicitly releases any eligible final file. The supplied agent runner supports Testnet only. Wallet secrets stay in the local agent environment.',
        ],
        note: 'MCP is the connection that lets an AI tool read the project. MPP is the separate payment exchange. Creating an MCP key does not, by itself, sign or send money.',
      },
    ],
  },
];
export const projectFlow = [
  {
    title: 'Start a project. Invite your client.',
    actor: 'Freelancer → client',
    text: 'The freelancer creates the project and sends a private invitation. The client signs in and accepts, so both people can use the same workspace.',
    topic: 'getting-started',
  },
  {
    title: 'Discuss the work. Approve the terms.',
    actor: 'Both people',
    text: 'Use Conversation to settle the details. The freelancer publishes the scope, price and revision limit in Agreement. Both people approve that exact version before it becomes active.',
    topic: 'agreements',
  },
  {
    title: 'Work through milestones.',
    actor: 'Freelancer → client',
    text: 'The freelancer creates milestones and submits completed work for review. The client can inspect a linked preview, then accept the milestone or request changes.',
    topic: 'milestones',
  },
  {
    title: 'Issue the invoice. Make the payment.',
    actor: 'Freelancer → client',
    text: 'The freelancer issues an invoice, optionally linked to a milestone. The client reviews the payment details and signs the transfer in their wallet. Tatum checks that it matches.',
    topic: 'payments',
  },
  {
    title: 'Reconcile. Release. Download.',
    actor: 'Freelancer → client',
    text: 'The freelancer allocates the matched receipt to the invoice. Once the agreed file conditions are met, they explicitly release the final. The client can then download it.',
    topic: 'files',
  },
  {
    title: 'Keep the useful lessons.',
    actor: 'Freelancer, throughout the project',
    text: 'Request a scope review when new work comes up. Parius can suggest a lesson; you confirm, edit or dismiss it. Confirmed lessons are stored through Walrus and recalled when relevant.',
    topic: 'memory',
  },
];
