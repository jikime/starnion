// StarPion CLI — single binary for managing all StarPion services.
package main

import (
	"os"

	"github.com/jikime/starpion/gateway/internal/cli"
)

func main() {
	root := cli.NewRootCmd()
	if err := root.Execute(); err != nil {
		os.Exit(1)
	}
}
