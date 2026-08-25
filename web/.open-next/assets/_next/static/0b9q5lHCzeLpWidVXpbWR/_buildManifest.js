self.__BUILD_MANIFEST = {
  "__rewrites": {
    "afterFiles": [],
    "beforeFiles": [
      {
        "has": [
          {
            "type": "header",
            "key": "next-url",
            "value": "/agents/(?<nxtPtokenId>[^/]+?)(?:/.*)?"
          }
        ],
        "source": "/agents/:nxtPtokenId/entries/:nxtPtxHash",
        "destination": "/agents/:nxtPtokenId/(.)entries/:nxtPtxHash"
      }
    ],
    "fallback": []
  },
  "sortedPages": [
    "/_app",
    "/_error"
  ]
};self.__BUILD_MANIFEST_CB && self.__BUILD_MANIFEST_CB()